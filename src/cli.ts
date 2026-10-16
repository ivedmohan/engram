#!/usr/bin/env node
import { loadConfig, loadDotEnv } from './config.js';

loadDotEnv();

const [, , command, subArg] = process.argv;

async function status() {
  const config = loadConfig();
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/health`);
    const body = await res.json();
    console.log(res.ok ? '✅ engram daemon is up' : '⚠️  engram daemon responded with an error', body);
  } catch {
    console.log(`❌ engram daemon is not running on 127.0.0.1:${config.port}. Start it with: engram up`);
  }
}

switch (command) {
  case 'up':
  case 'daemon': {
    const { startDaemon } = await import('./daemon/server.js');
    startDaemon();
    break;
  }
  case 'status':
    await status();
    break;
  case 'hook': {
    // Hooks must NEVER block or fail a Claude Code session — always exit 0, no matter what happens.
    // Every handler already catches its own errors internally; this is a last-resort safety net.
    try {
      const { readStdin, handleSessionStart, handleStop, handleSessionEnd, handlePreCompact } = await import(
        './hooks/claude-code.js'
      );
      const raw = await readStdin();
      const input = raw ? JSON.parse(raw) : {};
      const event = (subArg || input.hook_event_name || '').toLowerCase();

      switch (event) {
        case 'sessionstart':
          await handleSessionStart(input);
          break;
        case 'stop':
          await handleStop(input);
          break;
        case 'sessionend':
          await handleSessionEnd(input);
          break;
        case 'precompact':
          await handlePreCompact(input);
          break;
        default:
          console.error(`[engram-hook] unknown event "${event}", ignoring`);
      }
    } catch (err) {
      console.error('[engram-hook] unhandled error (non-fatal, exiting 0 anyway):', err);
    }
    process.exitCode = 0;
    break;
  }
  case 'install': {
    const scopeArgIndex = process.argv.indexOf('--scope');
    const scope = (scopeArgIndex >= 0 ? process.argv[scopeArgIndex + 1] : 'project') as 'user' | 'project';

    if (subArg === 'claude-code') {
      const { installClaudeCodeHooks, installClaudeCodeMcp } = await import('./install/claude-code.js');

      const mcpResult = installClaudeCodeMcp(scope);
      console.log(mcpResult.ok ? '✅ Registered engram MCP server' : `⚠️  MCP registration failed: ${mcpResult.output}`);

      const hooksResult = installClaudeCodeHooks(scope, process.cwd());
      console.log(`✅ Hooks merged into ${hooksResult.path}${hooksResult.backedUp ? ' (backed up original to .bak)' : ''}`);
      console.log('Restart Claude Code (or start a new session) for the hooks to take effect.');
    } else if (subArg === 'cursor') {
      const { installCursor } = await import('./install/cursor.js');
      const result = installCursor(scope, process.cwd());
      console.log(`✅ Registered engram MCP server in ${result.path}${result.backedUp ? ' (backed up original to .bak)' : ''}`);
      if (process.argv.includes('--with-rules')) {
        const { ensureRulesSnippet } = await import('./install/rules-snippet.js');
        const path = await import('node:path');
        const r = ensureRulesSnippet(path.join(process.cwd(), 'AGENTS.md'));
        console.log(r.added ? '✅ Added Engram usage notes to AGENTS.md' : 'ℹ️  AGENTS.md already has Engram usage notes');
      }
      console.log('Restart Cursor for it to pick up the new MCP server.');
    } else if (subArg === 'gemini-cli') {
      const { installGeminiCli } = await import('./install/gemini-cli.js');
      const result = installGeminiCli(scope, process.cwd());
      console.log(`✅ Registered engram MCP server in ${result.path}${result.backedUp ? ' (backed up original to .bak)' : ''}`);
      if (scope === 'project') {
        console.log('Note: unlike Claude Code hooks, this file is not gitignored by convention — it will be shared with anyone who clones this repo.');
      }
      if (process.argv.includes('--with-rules')) {
        const { ensureRulesSnippet } = await import('./install/rules-snippet.js');
        const path = await import('node:path');
        const r = ensureRulesSnippet(path.join(process.cwd(), 'GEMINI.md'));
        console.log(r.added ? '✅ Added Engram usage notes to GEMINI.md' : 'ℹ️  GEMINI.md already has Engram usage notes');
      }
      console.log('Restart Gemini CLI for it to pick up the new MCP server.');
    } else if (subArg === 'claude-desktop') {
      const { installClaudeDesktop } = await import('./install/claude-desktop.js');
      const result = installClaudeDesktop();
      console.log(`✅ Registered engram MCP server in ${result.path}${result.backedUp ? ' (backed up original to .bak)' : ''}`);
      console.log('Note: Claude Desktop has no per-project workspace, so this only reliably serves global-scope memories. Restart Claude Desktop for it to pick up the new MCP server.');
    } else {
      console.log('Usage: engram install <claude-code|cursor|gemini-cli|claude-desktop> [--scope user|project] [--with-rules]');
      process.exitCode = 1;
    }
    break;
  }
  default:
    console.log('Usage: engram <up|daemon|status|hook|install>');
    process.exitCode = command ? 1 : 0;
}
