import { FalkorDB, type Graph } from 'falkordb';

let dbPromise: ReturnType<typeof FalkorDB.connect> | null = null;
const graphCache = new Map<string, Graph>();

function getDb() {
  if (!dbPromise) {
    dbPromise = FalkorDB.connect({
      username: process.env.FALKORDB_USERNAME || undefined,
      password: process.env.FALKORDB_PASSWORD || undefined,
      socket: {
        host: process.env.FALKORDB_HOST || 'localhost',
        port: Number(process.env.FALKORDB_PORT || 6379),
      },
    });
  }
  return dbPromise;
}

export async function getGraph(slug: string): Promise<Graph> {
  const cached = graphCache.get(slug);
  if (cached) return cached;
  const db = await getDb();
  const graph = db.selectGraph(slug);
  graphCache.set(slug, graph);
  return graph;
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
