import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export type InstallScope = 'user' | 'project';

export function settingsPath(scope: InstallScope, projectRoot: string): string {
  return scope === 'user'
    ? path.join(homedir(), '.claude', 'settings.json')
    : path.join(projectRoot, '.claude', 'settings.local.json'); // .local.json: personal, gitignored by
      // Claude Code convention — installing Engram hooks shouldn't force them on every teammate who
      // clones the repo.
}

const HOOK_EVENTS = ['SessionStart', 'Stop', 'SessionEnd', 'PreCompact'] as const;

function hookCommand(event: (typeof HOOK_EVENTS)[number]): string {
  return `engram hook ${event.toLowerCase()}`;
}

/**
 * Pure function so it's testable without touching any real file: merges Engram's hooks into an
 * existing settings object, preserving every hook already there (never replaces the whole `hooks`
 * key) and skipping any event where an Engram hook is already registered (idempotent re-install).
 */
export function mergeEngramHooks(existing: unknown): Record<string, any> {
  const settings: Record<string, any> = existing && typeof existing === 'object' ? { ...(existing as any) } : {};
  settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? { ...settings.hooks } : {};

  for (const event of HOOK_EVENTS) {
    const command = hookCommand(event);
    const existingForEvent: any[] = Array.isArray(settings.hooks[event]) ? [...settings.hooks[event]] : [];

    const alreadyPresent = existingForEvent.some(
      (matcher) => Array.isArray(matcher?.hooks) && matcher.hooks.some((h: any) => h?.command === command),
    );
    if (alreadyPresent) continue;

    existingForEvent.push({
      matcher: '*',
      hooks: [{ type: 'command', command, timeout: event === 'SessionEnd' ? 10 : 30 }],
    });
    settings.hooks[event] = existingForEvent;
  }

  return settings;
}

export interface InstallHooksResult {
  path: string;
  backedUp: boolean;
}

/** Reads, backs up (if present), merges, and writes. The one function with real file side effects. */
export function installClaudeCodeHooks(scope: InstallScope, projectRoot: string): InstallHooksResult {
  const target = settingsPath(scope, projectRoot);
  mkdirSync(path.dirname(target), { recursive: true });

  let existing: unknown = {};
  let backedUp = false;
  if (existsSync(target)) {
    const raw = readFileSync(target, 'utf8');
    existing = raw.trim() ? JSON.parse(raw) : {};
    copyFileSync(target, `${target}.bak`);
    backedUp = true;
  }

  const merged = mergeEngramHooks(existing);
  writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
  return { path: target, backedUp };
}

function resolveMcpServerPath(): string {
  const builtPath = fileURLToPath(new URL('../mcp/server.js', import.meta.url));
  return existsSync(builtPath) ? builtPath : fileURLToPath(new URL('../mcp/server.ts', import.meta.url));
}

export interface InstallMcpResult {
  ok: boolean;
  output: string;
}

/** Shells out to the real `claude mcp add` CLI — confirmed command shape, not guessed. */
export function installClaudeCodeMcp(scope: InstallScope): InstallMcpResult {
  const mcpServerPath = resolveMcpServerPath();
  const usesTsx = mcpServerPath.endsWith('.ts');
  // Engram's "project" scope maps to `claude mcp add`'s "local" (personal, not shared via .mcp.json)
  // for the same reason as the hooks file choice above: don't impose Engram on every teammate.
  const claudeScope = scope === 'user' ? 'user' : 'local';
  const command = usesTsx ? 'npx' : process.execPath;
  const args = usesTsx ? ['tsx', mcpServerPath] : [mcpServerPath];

  try {
    const output = execFileSync('claude', ['mcp', 'add', '--scope', claudeScope, 'engram', '--', command, ...args], {
      encoding: 'utf8',
    });
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: err?.stdout?.toString() || err?.message || String(err) };
  }
}
