import type { Graph } from 'falkordb';

const ensured = new WeakSet<Graph>();

async function createIfMissing(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already indexed|already exists/i.test(msg)) return;
    throw new Error(`index setup failed for ${label}: ${msg}`);
  }
}

/**
 * Idempotent: safe to call on every daemon start / first use of a graph.
 * FalkorDB throws if an identical index already exists, so each call is
 * wrapped and "already indexed" errors are swallowed.
 */
export async function ensureIndexes(graph: Graph): Promise<void> {
  if (ensured.has(graph)) return;

  const embeddingDim = Number(process.env.EMBEDDING_DIM || 768);

  await Promise.all([
    createIfMissing('Memory.id', () => graph.createNodeRangeIndex('Memory', 'id')),
    createIfMissing('Memory.status', () => graph.createNodeRangeIndex('Memory', 'status')),
    createIfMissing('Memory.hash', () => graph.createNodeRangeIndex('Memory', 'hash')),
    createIfMissing('Entity.name', () => graph.createNodeRangeIndex('Entity', 'name')),
    createIfMissing('Session.id', () => graph.createNodeRangeIndex('Session', 'id')),
    createIfMissing('Project.slug', () => graph.createNodeRangeIndex('Project', 'slug')),
    createIfMissing('Memory.text (fulltext)', () => graph.createNodeFulltextIndex('Memory', 'text')),
    createIfMissing('Memory.embedding (vector)', () =>
      graph.createNodeVectorIndex('Memory', embeddingDim, 'cosine', 'embedding'),
    ),
  ]);

  ensured.add(graph);
}
