import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureDaemonRunning, daemonFetch, daemonFetchText } from '../daemon/rpc.js';
import { parseTranscriptFile, type TranscriptMessage } from '../transcripts/claude-code.js';
import { ENGRAM_HOME } from '../config.js';

export interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name?: string;
  transcript_path?: string;
  /** Stop only — more current than the transcript file, which is written asynchronously and can lag. */
  last_assistant_message?: string;
  /** SessionEnd only. */
  why?: string;
  [key: string]: unknown;
}

const OFFSETS_DIR = path.join(ENGRAM_HOME, 'offsets');

function offsetPath(sessionId: string): string {
  return path.join(OFFSETS_DIR, `${sessionId}.offset`);
}

function readOffset(sessionId: string): number {
  const p = offsetPath(sessionId);
  if (!existsSync(p)) return 0;
  const raw = readFileSync(p, 'utf8').trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function writeOffset(sessionId: string, line: number): void {
  if (!existsSync(OFFSETS_DIR)) mkdirSync(OFFSETS_DIR, { recursive: true });
  writeFileSync(offsetPath(sessionId), String(line));
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** SessionStart: print /context markdown to stdout so Claude Code injects it automatically. */
export async function handleSessionStart(input: HookInput): Promise<void> {
  try {
    await ensureDaemonRunning();
    const text = await daemonFetchText(`/context?cwd=${encodeURIComponent(input.cwd)}`);
    process.stdout.write(text);
  } catch (err) {
    console.error('[engram-hook] SessionStart failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * Shared by Stop, SessionEnd, PreCompact: send whatever's new in the transcript since the last
 * offset to /ingest. `fetchTimeoutMs` lets SessionEnd (tiny execution budget) skip waiting as long
 * as Stop can.
 */
async function flushTranscript(input: HookInput, opts: { skipEnsureDaemon?: boolean; fetchTimeoutMs?: number } = {}): Promise<void> {
  const sessionId = input.session_id;
  if (!sessionId || !input.transcript_path || !existsSync(input.transcript_path)) return;

  const startLine = readOffset(sessionId);
  const { messages, totalLines } = parseTranscriptFile(input.transcript_path, startLine);

  // The transcript file is written asynchronously and can lag behind — last_assistant_message
  // (Stop only) is guaranteed current, so append it if the transcript parse didn't already capture it.
  const lastMsg = typeof input.last_assistant_message === 'string' ? input.last_assistant_message.trim() : '';
  if (lastMsg && messages[messages.length - 1]?.text !== lastMsg) {
    messages.push({ role: 'assistant', text: lastMsg, ts: Date.now() } satisfies TranscriptMessage);
  }

  writeOffset(sessionId, totalLines); // advance regardless of outcome below — never re-send the same lines

  if (messages.length === 0) return;

  if (!opts.skipEnsureDaemon) {
    await ensureDaemonRunning();
  }

  await daemonFetch(
    'POST',
    '/ingest',
    { sessionId, tool: 'claude-code', cwd: input.cwd, messages },
    opts.fetchTimeoutMs,
  );
}

export async function handleStop(input: HookInput): Promise<void> {
  try {
    await flushTranscript(input, { skipEnsureDaemon: false });
  } catch (err) {
    console.error('[engram-hook] Stop failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

export async function handleSessionEnd(input: HookInput): Promise<void> {
  try {
    // Tiny execution budget (~1.5s default) — never attempt to start the daemon here, just try a
    // fast ingest and give up quickly if it's not already running.
    await flushTranscript(input, { skipEnsureDaemon: true, fetchTimeoutMs: 1000 });
  } catch (err) {
    console.error('[engram-hook] SessionEnd failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

export async function handlePreCompact(input: HookInput): Promise<void> {
  try {
    await flushTranscript(input, { skipEnsureDaemon: false });
  } catch (err) {
    console.error('[engram-hook] PreCompact failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}
