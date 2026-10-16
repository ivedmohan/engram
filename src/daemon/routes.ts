import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { resolveProject } from '../project.js';
import { hashText, toFulltextQuery } from '../util.js';
import { getGraph, listGraphNames, GLOBAL_GRAPH_SLUG, projectGraphSlug } from '../graph/client.js';
import {
  upsertSession,
  createMemory,
  supersede as supersedeMemory,
  forgetMemory,
  findMemoryByHash,
  listActiveMemories,
  fulltextSearch,
  entityExpand,
  listEntityNames,
  timeline as timelineQuery,
  explainMemory,
  graphDump,
} from '../graph/queries.js';
import { enqueue, queueDepth } from './queue.js';

type Scope = 'project' | 'global';

async function resolveTarget(cwd: string, scope?: Scope) {
  const project = resolveProject(cwd);
  const slug = scope === 'global' ? GLOBAL_GRAPH_SLUG : projectGraphSlug(project.slug);
  const graph = await getGraph(slug);
  return { graph, project, slug };
}

const KIND_WEIGHT: Record<string, number> = { decision: 3, preference: 2, fact: 1, task: 1, context: 0.5 };

export const routes = new Hono();

routes.get('/health', async (c) => {
  try {
    await getGraph(GLOBAL_GRAPH_SLUG);
    return c.json({ ok: true, falkordb: 'connected', queueDepth: queueDepth() });
  } catch (err) {
    return c.json({ ok: false, falkordb: 'error', error: err instanceof Error ? err.message : String(err) }, 503);
  }
});

const sessionSchema = z.object({
  tool: z.string(),
  cwd: z.string(),
  externalId: z.string().optional(),
  sessionId: z.string().optional(),
});

routes.post('/sessions', async (c) => {
  const body = sessionSchema.parse(await c.req.json());
  const project = resolveProject(body.cwd);
  const graph = await getGraph(projectGraphSlug(project.slug));
  const sessionId = body.sessionId || body.externalId || `${body.tool}-${ulid()}`;
  await upsertSession(graph, {
    id: sessionId,
    tool: body.tool,
    externalId: body.externalId,
    cwd: body.cwd,
    projectSlug: project.slug,
    projectName: project.name,
    projectRoot: project.root,
  });
  return c.json({ sessionId, projectSlug: project.slug });
});

const ingestSchema = z.object({
  sessionId: z.string(),
  tool: z.string(),
  cwd: z.string(),
  messages: z.array(z.object({ role: z.string(), text: z.string(), ts: z.number().optional() })),
});

routes.post('/ingest', async (c) => {
  const body = ingestSchema.parse(await c.req.json());
  // Extraction/reconciliation pipeline (T4) needs an LLM provider key and isn't wired yet.
  // Accept and queue now so the API shape is final; the job currently just logs.
  enqueue(async () => {
    console.log(
      `[ingest] queued ${body.messages.length} message(s) for session ${body.sessionId} (${body.tool}) — ` +
        `extraction pipeline not implemented yet (T4), no LLM provider configured`,
    );
  });
  return c.json({ accepted: true, queued: body.messages.length }, 202);
});

const memorySchema = z.object({
  text: z.string().min(1),
  kind: z.enum(['fact', 'decision', 'preference', 'task', 'context']).default('fact'),
  cwd: z.string(),
  tool: z.string(),
  scope: z.enum(['project', 'global']).default('project'),
  sessionId: z.string().optional(),
  entities: z.array(z.object({ name: z.string(), type: z.string().optional() })).optional(),
});

routes.post('/memories', async (c) => {
  const body = memorySchema.parse(await c.req.json());
  const { graph, project } = await resolveTarget(body.cwd, body.scope);

  const hash = hashText(body.text);
  const existing = await findMemoryByHash(graph, hash);
  if (existing) {
    return c.json({ id: existing.id, duplicate: true, projectSlug: project.slug });
  }

  const sessionId = body.sessionId || `${body.tool}-manual-${ulid()}`;
  await upsertSession(graph, {
    id: sessionId,
    tool: body.tool,
    cwd: body.cwd,
    projectSlug: project.slug,
    projectName: project.name,
    projectRoot: project.root,
  });

  const id = await createMemory(graph, {
    text: body.text,
    kind: body.kind,
    hash,
    sessionId,
    entities: body.entities,
  });

  return c.json({ id, duplicate: false, projectSlug: project.slug }, 201);
});

const supersedeSchema = z.object({
  newId: z.string(),
  oldId: z.string(),
  reason: z.string(),
  cwd: z.string(),
  scope: z.enum(['project', 'global']).default('project'),
});

routes.post('/memories/supersede', async (c) => {
  const body = supersedeSchema.parse(await c.req.json());
  const { graph } = await resolveTarget(body.cwd, body.scope);
  await supersedeMemory(graph, body.newId, body.oldId, body.reason);
  return c.json({ ok: true });
});

const recallSchema = z.object({
  query: z.string(),
  cwd: z.string(),
  limit: z.number().optional().default(8),
  includeSuperseded: z.boolean().optional().default(false),
});

routes.post('/recall', async (c) => {
  const body = recallSchema.parse(await c.req.json());
  const { graph: projectGraph, project } = await resolveTarget(body.cwd, 'project');
  const globalGraph = await getGraph(GLOBAL_GRAPH_SLUG);

  const results = new Map<string, { memory: any; score: number; via: string }>();
  const ftQuery = toFulltextQuery(body.query);

  for (const graph of [projectGraph, globalGraph]) {
    if (ftQuery) {
      const ft = await fulltextSearch(graph, ftQuery, body.limit);
      for (const r of ft) {
        if (r.memory && !results.has((r.memory as any).id)) {
          results.set((r.memory as any).id, { memory: r.memory, score: r.score, via: 'fulltext' });
        }
      }
    }

    const names = await listEntityNames(graph);
    const q = body.query.toLowerCase();
    const matched = names.filter((n) => q.includes(n));
    if (matched.length > 0) {
      const expanded = await entityExpand(graph, matched, 2);
      for (const m of expanded) {
        const id = (m as any).id;
        if (!results.has(id)) results.set(id, { memory: m, score: 0.5, via: 'entity-graph' });
      }
    }
  }

  const ranked = Array.from(results.values())
    .map((r) => {
      const kindWeight = KIND_WEIGHT[r.memory.kind] ?? 1;
      const ageMs = Date.now() - (r.memory.createdAt ?? 0);
      const recency = Math.exp(-ageMs / (1000 * 60 * 60 * 24 * 14)); // ~2 week half-life-ish decay
      const rank = r.score * 0.5 + recency * 0.3 + kindWeight * 0.2;
      return { ...r, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, body.limit);

  const withProvenance = [];
  for (const r of ranked) {
    const scope: Scope = r.memory.id ? 'project' : 'project';
    const explained =
      (await explainMemory(projectGraph, r.memory.id)) ?? (await explainMemory(globalGraph, r.memory.id));
    withProvenance.push({
      ...r.memory,
      via: r.via,
      tool: explained?.tool,
      sessionStartedAt: explained?.session?.startedAt,
      supersedes: explained?.supersedes ? { text: explained.supersedes.text, at: explained.memory?.createdAt } : undefined,
    });
  }

  return c.json({ query: body.query, projectSlug: project.slug, results: withProvenance });
});

routes.get('/context', async (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json({ error: 'cwd query param required' }, 400);
  const { graph: projectGraph, project } = await resolveTarget(cwd, 'project');
  const globalGraph = await getGraph(GLOBAL_GRAPH_SLUG);

  const [projectMemories, globalMemories] = await Promise.all([
    listActiveMemories(projectGraph, 15),
    listActiveMemories(globalGraph, 10),
  ]);

  const lines = [`# Engram context — ${project.name}`, ''];
  if (globalMemories.length > 0) {
    lines.push('## Preferences (all projects)');
    for (const m of globalMemories as any[]) lines.push(`- (${m.kind}) ${m.text}`);
    lines.push('');
  }
  if (projectMemories.length > 0) {
    lines.push(`## This project (${project.name})`);
    for (const m of projectMemories as any[]) lines.push(`- (${m.kind}) ${m.text}`);
  }
  if (projectMemories.length === 0 && globalMemories.length === 0) {
    lines.push('_No memories yet for this project._');
  }

  return c.text(lines.join('\n'));
});

const forgetSchema = z.object({
  memoryId: z.string(),
  cwd: z.string(),
  scope: z.enum(['project', 'global']).default('project'),
});

routes.post('/forget', async (c) => {
  const body = forgetSchema.parse(await c.req.json());
  const { graph } = await resolveTarget(body.cwd, body.scope);
  await forgetMemory(graph, { id: body.memoryId });
  return c.json({ ok: true });
});

routes.get('/timeline', async (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json({ error: 'cwd query param required' }, 400);
  const { graph: projectGraph } = await resolveTarget(cwd, 'project');
  const globalGraph = await getGraph(GLOBAL_GRAPH_SLUG);
  const [projectRows, globalRows] = await Promise.all([timelineQuery(projectGraph, 100), timelineQuery(globalGraph, 50)]);
  const merged = [...projectRows, ...globalRows].sort(
    (a, b) => ((b.memory as any)?.createdAt ?? 0) - ((a.memory as any)?.createdAt ?? 0),
  );
  return c.json({ events: merged });
});

routes.get('/explain/:memoryId', async (c) => {
  const memoryId = c.req.param('memoryId');
  const cwd = c.req.query('cwd');
  const scope = (c.req.query('scope') as Scope) || 'project';
  if (!cwd) return c.json({ error: 'cwd query param required' }, 400);
  const { graph } = await resolveTarget(cwd, scope);
  const explained = await explainMemory(graph, memoryId);
  if (!explained) return c.json({ error: 'not found' }, 404);
  return c.json(explained);
});

routes.get('/graph', async (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json({ error: 'cwd query param required' }, 400);
  const { graph, project } = await resolveTarget(cwd, 'project');
  const rows = await graphDump(graph, 500);
  return c.json({ projectSlug: project.slug, rows });
});

routes.get('/projects', async (c) => {
  const names = await listGraphNames();
  const projectGraphs = names.filter((n) => n.startsWith('engram_p_'));
  const projects = [];
  for (const slug of projectGraphs) {
    const graph = await getGraph(slug);
    const result = await graph.query<{ p: { properties: Record<string, unknown> } }>(`MATCH (p:Project) RETURN p LIMIT 1`);
    const node = result.data?.[0]?.p;
    projects.push(node ? node.properties : { slug });
  }
  return c.json({ projects });
});
