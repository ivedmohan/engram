import path from 'node:path';
import { homedir } from 'node:os';
import { writeMcpConfig, type WriteMcpConfigResult } from './mcp-json.js';
import { resolveMcpCommand } from './resolve.js';

/**
 * Claude Desktop has no per-project workspace concept — there's no real "cwd" to set. No --scope
 * option: this is always a single, user-level install (same conclusion the T3/T6 research reached).
 *
 * Known limitation, not yet fixed: without ENGRAM_CWD, the MCP server falls back to
 * `process.cwd()` (wherever Claude Desktop happens to spawn the process from), and
 * `engram_remember`'s default scope is "project" — so a bare "remember X" from Desktop doesn't
 * automatically land in engram_global the way the pitch implies. Making that automatic needs a
 * small change to mcp/server.ts (bias the default scope to "global" when ENGRAM_CWD was never set),
 * which hasn't been made since Claude Desktop is explicitly lower-priority than Claude Code/Cursor/
 * Gemini CLI for the demo. Document rather than silently ship the stronger claim.
 */
export function installClaudeDesktop(): WriteMcpConfigResult {
  const target = path.join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  const { command, args } = resolveMcpCommand();
  return writeMcpConfig(target, 'engram', {
    command,
    args,
    env: { ENGRAM_TOOL: 'claude-desktop' },
  });
}
