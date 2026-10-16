import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The command+args any client's MCP config should launch: the built JS if it exists, else tsx on source. */
export function resolveMcpCommand(): { command: string; args: string[] } {
  const builtPath = fileURLToPath(new URL('../mcp/server.js', import.meta.url));
  if (existsSync(builtPath)) {
    return { command: process.execPath, args: [builtPath] };
  }
  const tsPath = fileURLToPath(new URL('../mcp/server.ts', import.meta.url));
  return { command: 'npx', args: ['tsx', tsPath] };
}
