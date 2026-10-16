import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { routes } from './routes.js';
import { loadConfig, ensureEngramHome, ENGRAM_HOME, loadDotEnv } from '../config.js';
import { closeDb } from '../graph/client.js';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const app = new Hono();
app.route('/', routes);

export function startDaemon() {
  loadDotEnv();
  ensureEngramHome();
  const config = loadConfig();

  const server = serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
    console.log(`engram daemon listening on http://127.0.0.1:${info.port}`);
    writeFileSync(path.join(ENGRAM_HOME, 'daemon.pid'), String(process.pid));
  });

  const shutdown = async () => {
    console.log('\nengram daemon shutting down...');
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDaemon();
}
