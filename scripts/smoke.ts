import { getGraph, closeDb, projectGraphSlug } from '../src/graph/client.js';
import { ensureIndexes } from '../src/graph/schema.js';
import {
  upsertSession,
  createMemory,
  supersede,
  listActiveMemories,
  explainMemory,
} from '../src/graph/queries.js';

async function main() {
  const slug = projectGraphSlug('smoke-test');

  // FalkorDB persists to disk (docker volume) — without this, every re-run of this script accumulates
  // more memories in the same graph instead of starting clean, and the assertions below would fail.
  const { FalkorDB } = await import('falkordb');
  const { loadConfig } = await import('../src/config.js');
  const cfg = loadConfig();
  const db = await FalkorDB.connect({ socket: { host: cfg.falkordb.host, port: cfg.falkordb.port } });
  try {
    await db.selectGraph(slug).delete();
  } catch {
    // graph didn't exist yet — fine
  }
  await db.close();

  const graph = await getGraph(slug);

  console.log(`[1/6] ensureIndexes() on ${slug}`);
  await ensureIndexes(graph);

  console.log('[2/6] upsertSession (claude-code)');
  const sessionId = `smoke-session-${Date.now()}`;
  await upsertSession(graph, {
    id: sessionId,
    tool: 'claude-code',
    cwd: '/tmp/demo-relayer',
    projectSlug: 'smoke-test',
    projectName: 'demo-relayer',
    projectRoot: '/tmp/demo-relayer',
  });

  console.log('[3/6] createMemory x3 (express, hono, pnpm)');
  const expressId = await createMemory(graph, {
    text: 'Relayer uses Express',
    kind: 'decision',
    hash: 'smoke-express',
    sessionId,
    entities: [{ name: 'Express', type: 'library' }],
  });
  const honoId = await createMemory(graph, {
    text: 'Relayer uses Hono',
    kind: 'decision',
    hash: 'smoke-hono',
    sessionId,
    entities: [{ name: 'Hono', type: 'library' }],
  });
  const pnpmId = await createMemory(graph, {
    text: 'Always use pnpm in this repo',
    kind: 'preference',
    hash: 'smoke-pnpm',
    sessionId,
    entities: [{ name: 'pnpm', type: 'command' }],
  });
  console.log(`      created: express=${expressId} hono=${honoId} pnpm=${pnpmId}`);

  console.log('[4/6] supersede(hono -> express)');
  await supersede(graph, honoId, expressId, 'switched for built-in validators and smaller footprint');

  console.log('[5/6] listActiveMemories()');
  const active = await listActiveMemories(graph, 50);
  console.log(`      ${active.length} active memories:`, active.map((m: any) => `${m.kind}:${m.text}`));
  if (active.length !== 2) {
    throw new Error(`expected 2 active memories (hono + pnpm), got ${active.length}`);
  }
  if (active.some((m: any) => m.id === expressId)) {
    throw new Error('express memory should be superseded, not active');
  }

  console.log('[6/6] explainMemory(hono)');
  const explained = await explainMemory(graph, honoId);
  console.log('      ', JSON.stringify(explained, null, 2));
  if (!explained?.supersedes) {
    throw new Error('expected hono memory to carry a supersession chain');
  }

  console.log('\n✅ smoke test passed');
}

main()
  .catch((err) => {
    console.error('\n❌ smoke test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
