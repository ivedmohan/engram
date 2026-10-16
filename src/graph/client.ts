import { FalkorDB, type Graph } from 'falkordb';
import { loadConfig } from '../config.js';
import { ensureIndexes } from './schema.js';

let dbPromise: ReturnType<typeof FalkorDB.connect> | null = null;
const graphCache = new Map<string, Graph>();

function getDb() {
  if (!dbPromise) {
    const cfg = loadConfig();
    dbPromise = FalkorDB.connect({
      username: cfg.falkordb.username,
      password: cfg.falkordb.password,
      socket: { host: cfg.falkordb.host, port: cfg.falkordb.port },
    });
  }
  return dbPromise;
}

export async function getGraph(slug: string): Promise<Graph> {
  const cached = graphCache.get(slug);
  if (cached) return cached;
  const db = await getDb();
  const graph = db.selectGraph(slug);
  await ensureIndexes(graph);
  graphCache.set(slug, graph);
  return graph;
}

export async function listGraphNames(): Promise<string[]> {
  const db = await getDb();
  return db.list();
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.close();
  dbPromise = null;
  graphCache.clear();
}

export const GLOBAL_GRAPH_SLUG = 'engram_global';

export function projectGraphSlug(projectSlug: string): string {
  return `engram_p_${projectSlug}`;
}
