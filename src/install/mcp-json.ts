import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Only honored by clients that support it (confirmed for Gemini CLI, not Cursor/Claude Desktop) —
   * harmless to include everywhere since unknown fields are ignored by other clients. */
  cwd?: string;
}

/** Pure function: sets/replaces only OUR key under mcpServers, preserving every other server entry. */
export function mergeMcpServer(existing: unknown, serverName: string, entry: McpServerEntry): Record<string, any> {
  const config: Record<string, any> = existing && typeof existing === 'object' ? { ...(existing as any) } : {};
  config.mcpServers = config.mcpServers && typeof config.mcpServers === 'object' ? { ...config.mcpServers } : {};
  config.mcpServers[serverName] = entry;
  return config;
}

export interface WriteMcpConfigResult {
  path: string;
  backedUp: boolean;
}

export function writeMcpConfig(targetPath: string, serverName: string, entry: McpServerEntry): WriteMcpConfigResult {
  mkdirSync(path.dirname(targetPath), { recursive: true });

  let existing: unknown = {};
  let backedUp = false;
  if (existsSync(targetPath)) {
    const raw = readFileSync(targetPath, 'utf8');
    existing = raw.trim() ? JSON.parse(raw) : {};
    copyFileSync(targetPath, `${targetPath}.bak`);
    backedUp = true;
  }

  const merged = mergeMcpServer(existing, serverName, entry);
  writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n');
  return { path: targetPath, backedUp };
}
