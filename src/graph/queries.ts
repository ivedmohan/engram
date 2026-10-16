import type { Graph } from 'falkordb';
import { ulid } from 'ulid';

export type MemoryKind = 'fact' | 'decision' | 'preference' | 'task' | 'context';
export type MemoryStatus = 'active' | 'superseded' | 'forgotten';

export interface EntityInput {
  name: string;
  type?: string;
}

export interface CreateMemoryInput {
  text: string;
  kind: MemoryKind;
  confidence?: number;
  hash: string;
  embedding?: number[];
  entities?: EntityInput[];
  sessionId: string;
}

interface GraphNode<T = Record<string, unknown>> {
  id: number;
  labels: string[];
  properties: T;
}

// FalkorDB result rows are objects keyed by RETURN alias, e.g. `RETURN m, score`
// comes back as `{ m: GraphNode, score: number }` — NOT a positional tuple/array.
type Row<T extends Record<string, unknown>> = T;

function props<T>(node: GraphNode<T> | null | undefined): T | undefined {
  return node?.properties;
}

// ---------------------------------------------------------------------------
// Project / Tool / Session upserts
// ---------------------------------------------------------------------------

export async function upsertProject(
  graph: Graph,
  input: { slug: string; name: string; root: string; gitRemote?: string },
) {
  const result = await graph.query<Row<{ p: GraphNode }>>(
    `MERGE (p:Project {slug: $slug})
     ON CREATE SET p.id = $id, p.name = $name, p.root = $root, p.gitRemote = $gitRemote, p.createdAt = $now
     RETURN p`,
    { params: { slug: input.slug, id: ulid(), name: input.name, root: input.root, gitRemote: input.gitRemote ?? null, now: Date.now() } },
  );
  return props(result.data?.[0]?.p);
}

export async function upsertSession(
  graph: Graph,
  input: { id: string; tool: string; externalId?: string; cwd: string; projectSlug: string; projectName: string; projectRoot: string },
) {
  await graph.query(
    `MERGE (t:Tool {name: $tool})
     MERGE (p:Project {slug: $projectSlug})
       ON CREATE SET p.id = $projectId, p.name = $projectName, p.root = $projectRoot, p.createdAt = $now
     MERGE (s:Session {id: $id})
       ON CREATE SET s.tool = $tool, s.externalId = $externalId, s.cwd = $cwd, s.startedAt = $now, s.processedOffset = 0
     MERGE (t)-[:RAN]->(s)
     MERGE (s)-[:IN_PROJECT]->(p)`,
    {
      params: {
        id: input.id,
        tool: input.tool,
        externalId: input.externalId ?? null,
        cwd: input.cwd,
        projectSlug: input.projectSlug,
        projectId: ulid(),
        projectName: input.projectName,
        projectRoot: input.projectRoot,
        now: Date.now(),
      },
    },
  );
}

export async function setSessionOffset(graph: Graph, sessionId: string, offset: number): Promise<void> {
  await graph.query(`MATCH (s:Session {id: $id}) SET s.processedOffset = $offset`, {
    params: { id: sessionId, offset },
  });
}

export async function endSession(graph: Graph, sessionId: string): Promise<void> {
  await graph.query(`MATCH (s:Session {id: $id}) SET s.endedAt = $now`, {
    params: { id: sessionId, now: Date.now() },
  });
}

// ---------------------------------------------------------------------------
// Memory writes
// ---------------------------------------------------------------------------

export async function createMemory(graph: Graph, input: CreateMemoryInput): Promise<string> {
  const id = ulid();
  const now = Date.now();
  const entities = input.entities ?? [];

  const result = await graph.query<Row<{ m: GraphNode }>>(
    `MATCH (s:Session {id: $sessionId})
     CREATE (m:Memory {
       id: $id, text: $text, kind: $kind, status: 'active',
       confidence: $confidence, createdAt: $now, validFrom: $now, hash: $hash
     })
     MERGE (s)-[:CAPTURED]->(m)
     WITH m
     UNWIND $entities AS ent
       MERGE (e:Entity {name: ent.name})
         ON CREATE SET e.id = ent.id, e.display = ent.display, e.type = ent.type
       MERGE (m)-[:ABOUT]->(e)
     RETURN m`,
    {
      params: {
        id,
        sessionId: input.sessionId,
        text: input.text,
        kind: input.kind,
        confidence: input.confidence ?? 0.8,
        now,
        hash: input.hash,
        entities: entities.map((e) => ({ id: ulid(), name: e.name.toLowerCase(), display: e.name, type: e.type ?? 'concept' })),
      },
    },
  );

  if (!result.data || result.data.length === 0) {
    throw new Error(`createMemory: no Session found with id ${input.sessionId} — memory was not created`);
  }

  if (input.embedding) {
    await graph.query(`MATCH (m:Memory {id: $id}) SET m.embedding = vecf32($vec)`, {
      params: { id, vec: input.embedding },
    });
  }

  // bump RELATED_TO weight between every pair of co-mentioned entities
  if (entities.length > 1) {
    const names = entities.map((e) => e.name.toLowerCase());
    await graph.query(
      `UNWIND $pairs AS pair
       MATCH (a:Entity {name: pair[0]}), (b:Entity {name: pair[1]})
       MERGE (a)-[r:RELATED_TO]-(b)
       ON CREATE SET r.weight = 1
       ON MATCH SET r.weight = r.weight + 1`,
      { params: { pairs: pairIndices(names) } },
    );
  }

  return id;
}

function pairIndices(names: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) pairs.push([names[i], names[j]]);
  }
  return pairs;
}

export async function supersede(graph: Graph, newId: string, oldId: string, reason: string): Promise<void> {
  await graph.query(
    `MATCH (n:Memory {id: $newId}), (o:Memory {id: $oldId})
     CREATE (n)-[:SUPERSEDES {at: $now, reason: $reason}]->(o)
     SET o.status = 'superseded', o.validTo = $now`,
    { params: { newId, oldId, reason, now: Date.now() } },
  );
}

export async function contradict(graph: Graph, aId: string, bId: string): Promise<void> {
  await graph.query(
    `MATCH (a:Memory {id: $aId}), (b:Memory {id: $bId})
     CREATE (a)-[:CONTRADICTS {at: $now}]->(b)`,
    { params: { aId, bId, now: Date.now() } },
  );
}

export async function forgetMemory(graph: Graph, idOrQuery: { id: string }): Promise<void> {
  await graph.query(`MATCH (m:Memory {id: $id}) SET m.status = 'forgotten'`, { params: { id: idOrQuery.id } });
}

export async function findMemoryByHash(graph: Graph, hash: string): Promise<{ id: string } | undefined> {
  const result = await graph.query<Row<{ m: GraphNode<{ id: string }> }>>(
    `MATCH (m:Memory {hash: $hash}) WHERE m.status <> 'forgotten' RETURN m LIMIT 1`,
    { params: { hash } },
  );
  return props(result.data?.[0]?.m);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listActiveMemories(graph: Graph, limit = 50) {
  const result = await graph.query<Row<{ m: GraphNode }>>(
    `MATCH (m:Memory) WHERE m.status = 'active' RETURN m ORDER BY m.createdAt DESC LIMIT $limit`,
    { params: { limit } },
  );
  return (result.data ?? []).map((row) => props(row.m)).filter(Boolean);
}

export async function vectorSearch(graph: Graph, vec: number[], k = 10) {
  const result = await graph.query<Row<{ node: GraphNode; score: number }>>(
    `CALL db.idx.vector.queryNodes('Memory', 'embedding', $k, vecf32($vec)) YIELD node, score
     WHERE node.status = 'active'
     RETURN node, score`,
    { params: { k, vec } },
  );
  return (result.data ?? []).map((row) => ({ memory: props(row.node), score: row.score }));
}

export async function fulltextSearch(graph: Graph, term: string, limit = 10) {
  const result = await graph.query<Row<{ node: GraphNode; score: number }>>(
    `CALL db.idx.fulltext.queryNodes('Memory', $term) YIELD node, score
     WHERE node.status = 'active'
     RETURN node, score LIMIT $limit`,
    { params: { term, limit } },
  );
  return (result.data ?? []).map((row) => ({ memory: props(row.node), score: row.score }));
}

export async function entityExpand(graph: Graph, names: string[], hops = 2) {
  const result = await graph.query<Row<{ m: GraphNode }>>(
    `MATCH (e:Entity) WHERE e.name IN $names
     OPTIONAL MATCH (e)-[:RELATED_TO*1..${Math.max(1, Math.min(hops, 2))}]-(e2:Entity)
     WITH collect(DISTINCT e) + collect(DISTINCT e2) AS ents
     UNWIND ents AS ent
     WITH ent WHERE ent IS NOT NULL
     MATCH (m:Memory)-[:ABOUT]->(ent)
     WHERE m.status = 'active'
     RETURN DISTINCT m`,
    { params: { names: names.map((n) => n.toLowerCase()) } },
  );
  return (result.data ?? []).map((row) => props(row.m)).filter(Boolean);
}

export async function timeline(graph: Graph, limit = 100) {
  const result = await graph.query<Row<{ tool: string; sessionStart: number; m: GraphNode }>>(
    `MATCH (t:Tool)-[:RAN]->(s:Session)-[:CAPTURED]->(m:Memory)
     RETURN t.name AS tool, s.startedAt AS sessionStart, m
     ORDER BY m.createdAt DESC LIMIT $limit`,
    { params: { limit } },
  );
  return (result.data ?? []).map((row) => ({ tool: row.tool, sessionStart: row.sessionStart, memory: props(row.m) }));
}

export async function explainMemory(graph: Graph, id: string) {
  const result = await graph.query<Row<{ m: GraphNode; tool: string; s: GraphNode; old: GraphNode | null; entities: GraphNode[] }>>(
    `MATCH (t:Tool)-[:RAN]->(s:Session)-[:CAPTURED]->(m:Memory {id: $id})
     OPTIONAL MATCH (m)-[sup:SUPERSEDES]->(old:Memory)
     OPTIONAL MATCH (m)-[:ABOUT]->(e:Entity)
     RETURN m, t.name AS tool, s, old, collect(e) AS entities`,
    { params: { id } },
  );
  const row = result.data?.[0];
  if (!row) return undefined;
  return {
    memory: props(row.m),
    tool: row.tool,
    session: props(row.s),
    supersedes: row.old ? props(row.old) : undefined,
    entities: (row.entities ?? []).map((e) => props(e)).filter(Boolean),
  };
}

export async function graphDump(graph: Graph, limit = 500) {
  const result = await graph.query<Row<{ n: GraphNode; r: unknown; m: GraphNode | null }>>(
    `MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit`,
    { params: { limit } },
  );
  return result.data ?? [];
}
