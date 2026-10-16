/**
 * Reproduces the PLAN.md §2 demo scenario directly against the graph layer — no LLM calls, no
 * daemon required running. This is the reliability fallback for recording the demo video: if live
 * extraction misbehaves (LLM non-determinism, rate limits, no network), this still produces the
 * exact end state the demo narrates.
 */
import { getGraph, closeDb, projectGraphSlug } from '../src/graph/client.js';
import { upsertSession, createMemory, supersede } from '../src/graph/queries.js';
import { resolveProject } from '../src/project.js';

const CWD = '/tmp/demo-relayer';

async function main() {
  // Must derive the slug the same way the daemon does (resolveProject), or this seeds a graph the
  // daemon will never look at when a client queries cwd=CWD.
  const project = resolveProject(CWD);
  const PROJECT_SLUG = project.slug;
  const graph = await getGraph(projectGraphSlug(PROJECT_SLUG));

  console.log('[1/4] Claude Code, Tuesday 10:14 AM — "Relayer uses Express"');
  const sessionTue = 'demo-claude-code-tue';
  await upsertSession(graph, {
    id: sessionTue,
    tool: 'claude-code',
    cwd: CWD,
    projectSlug: PROJECT_SLUG,
    projectName: 'demo-relayer',
    projectRoot: CWD,
  });
  const expressId = await createMemory(graph, {
    text: 'Relayer uses Express',
    kind: 'decision',
    hash: 'seed-express',
    sessionId: sessionTue,
    entities: [{ name: 'Express', type: 'library' }, { name: 'relayer', type: 'concept' }],
  });

  console.log('[2/4] Claude Code, Thursday 2:47 PM — "Relayer uses Hono" + "Always use pnpm"');
  const sessionThu = 'demo-claude-code-thu';
  await upsertSession(graph, {
    id: sessionThu,
    tool: 'claude-code',
    cwd: CWD,
    projectSlug: PROJECT_SLUG,
    projectName: 'demo-relayer',
    projectRoot: CWD,
  });
  const honoId = await createMemory(graph, {
    text: 'Relayer uses Hono',
    kind: 'decision',
    hash: 'seed-hono',
    sessionId: sessionThu,
    entities: [{ name: 'Hono', type: 'library' }, { name: 'relayer', type: 'concept' }],
  });
  const pnpmId = await createMemory(graph, {
    text: 'Always use pnpm in this repo',
    kind: 'preference',
    hash: 'seed-pnpm',
    sessionId: sessionThu,
    entities: [{ name: 'pnpm', type: 'command' }],
  });

  console.log('[3/4] Supersede Express -> Hono');
  await supersede(graph, honoId, expressId, 'switched for built-in validators and smaller footprint');

  console.log('[4/4] Cursor, Thursday 3:05 PM — session registered (recall happens live, not seeded)');
  await upsertSession(graph, {
    id: 'demo-cursor-thu',
    tool: 'cursor',
    cwd: CWD,
    projectSlug: PROJECT_SLUG,
    projectName: 'demo-relayer',
    projectRoot: CWD,
  });

  console.log('\n✅ Seed complete.');
  console.log(`   Project graph: ${projectGraphSlug(PROJECT_SLUG)}`);
  console.log(`   Express id:  ${expressId} (superseded)`);
  console.log(`   Hono id:     ${honoId} (active, supersedes Express)`);
  console.log(`   pnpm id:     ${pnpmId} (active)`);
  console.log(`\n   Try: curl "http://127.0.0.1:7777/context?cwd=${CWD}"`);
  console.log(`   Or:  curl -X POST http://127.0.0.1:7777/recall -H 'content-type: application/json' -d '{"query":"what framework does the relayer use","cwd":"${CWD}"}'`);

  await closeDb();
}

main().catch((err) => {
  console.error('❌ seed-demo failed:', err);
  process.exitCode = 1;
});
