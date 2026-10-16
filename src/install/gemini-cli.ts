import path from 'node:path';
import { homedir } from 'node:os';
import { writeMcpConfig, type WriteMcpConfigResult } from './mcp-json.js';
import { resolveMcpCommand } from './resolve.js';

export type InstallScope = 'user' | 'project';

/**
 * ~/.gemini/settings.json (user) or .gemini/settings.json (project). Unlike Claude Code's hooks and
 * Cursor's mcp.json, no gitignored ".local" variant is confirmed for Gemini CLI — project scope here
 * really does mean "shared with anyone who clones this repo." Document that asymmetry rather than
 * invent an unconfirmed file name.
 */
export function installGeminiCli(scope: InstallScope, projectRoot: string): WriteMcpConfigResult {
  const target =
    scope === 'user' ? path.join(homedir(), '.gemini', 'settings.json') : path.join(projectRoot, '.gemini', 'settings.json');

  const { command, args } = resolveMcpCommand();
  return writeMcpConfig(target, 'engram', {
    command,
    args,
    cwd: projectRoot, // Gemini CLI's config format confirmed to support this field directly
    env: { ENGRAM_TOOL: 'gemini-cli', ENGRAM_CWD: projectRoot },
  });
}
