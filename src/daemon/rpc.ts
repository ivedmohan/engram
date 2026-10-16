import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadConfig } from '../config.js';

const config = loadConfig();
export const DAEMON_BASE_URL = `http://127.0.0.1:${config.port}`;

/** Best-effort: pings /health, and if it's not up, spawns the daemon detached and gives it a moment. */
export async function ensureDaemonRunning(): Promise<void> {
  try {
    const res = await fetch(`${DAEMON_BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return;
  } catch {
    // fall through to spawn
  }
  console.error('[engram] daemon not reachable, starting it...');
  const builtPath = fileURLToPath(new URL('./server.js', import.meta.url));
  const child = existsSync(builtPath)
    ? spawn(process.execPath, [builtPath], { detached: true, stdio: 'ignore', env: process.env })
    : spawn('npx', ['tsx', fileURLToPath(new URL('./server.ts', import.meta.url))], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

export async function daemonFetch<T>(
  method: 'GET' | 'POST',
  pathAndQuery: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<T> {
  const res = await fetch(`${DAEMON_BASE_URL}${pathAndQuery}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`engram daemon ${method} ${pathAndQuery} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as T;
}

export async function daemonFetchText(pathAndQuery: string): Promise<string> {
  const res = await fetch(`${DAEMON_BASE_URL}${pathAndQuery}`);
  return res.text();
}
