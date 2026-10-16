import path from 'node:path';
import { homedir } from 'node:os';
import { writeMcpConfig, type WriteMcpConfigResult } from './mcp-json.js';
import { resolveMcpCommand } from './resolve.js';

export type InstallScope = 'user' | 'project';

/** .cursor/mcp.json (project) or ~/.cursor/mcp.json (global); project overrides global for the same name. */
export function installCursor(scope: InstallScope, projectRoot: string): WriteMcpConfigResult {
  const target =
    scope === 'user' ? path.join(homedir(), '.cursor', 'mcp.json') : path.join(projectRoot, '.cursor', 'mcp.json');

  const { command, args } = resolveMcpCommand();
  return writeMcpConfig(target, 'engram', {
    command,
    args,
    // Cursor's mcp.json doesn't have a confirmed `cwd` field — bake the project root in directly as
    // ENGRAM_CWD instead of relying on the client to launch the server with the right working dir.
    env: { ENGRAM_TOOL: 'cursor', ENGRAM_CWD: projectRoot },
  });
}
