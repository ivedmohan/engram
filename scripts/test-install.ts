import { mergeEngramHooks } from '../src/install/claude-code.js';
import { installClaudeCodeHooks } from '../src/install/claude-code.js';
import { mergeMcpServer } from '../src/install/mcp-json.js';
import { installCursor } from '../src/install/cursor.js';
import { installGeminiCli } from '../src/install/gemini-cli.js';
import { ensureRulesSnippet } from '../src/install/rules-snippet.js';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failures++;
}

// 1. Merging into empty settings creates all 4 hook events.
const fromEmpty = mergeEngramHooks({});
check('creates SessionStart hook', Array.isArray(fromEmpty.hooks.SessionStart) && fromEmpty.hooks.SessionStart.length === 1);
check('creates Stop hook', fromEmpty.hooks.Stop[0].hooks[0].command === 'engram hook stop');
check('creates all 4 events', ['SessionStart', 'Stop', 'SessionEnd', 'PreCompact'].every((e) => fromEmpty.hooks[e]));

// 2. Merging preserves an existing, unrelated hook on the same event (never clobbers).
const withExisting = {
  hooks: {
    Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'my-other-tool --flush' }] }],
  },
  someOtherSetting: 'untouched',
};
const merged = mergeEngramHooks(withExisting);
check('preserves existing Stop hook', merged.hooks.Stop.some((m: any) => m.hooks.some((h: any) => h.command === 'my-other-tool --flush')));
check('adds engram Stop hook alongside it', merged.hooks.Stop.some((m: any) => m.hooks.some((h: any) => h.command === 'engram hook stop')));
check('preserves unrelated top-level settings', merged.someOtherSetting === 'untouched');

// 3. Idempotent: running merge twice doesn't duplicate the engram hook.
const mergedTwice = mergeEngramHooks(merged);
const stopHookCount = mergedTwice.hooks.Stop.flatMap((m: any) => m.hooks).filter((h: any) => h.command === 'engram hook stop').length;
check('idempotent — no duplicate engram hook on re-merge', stopHookCount === 1);

// 4. installClaudeCodeHooks against a SCRATCH directory (never the real ~/.claude or project settings).
const scratchDir = mkdtempSync(path.join(tmpdir(), 'engram-install-test-'));
const fakeProjectRoot = path.join(scratchDir, 'fake-project');
mkdirSync(fakeProjectRoot, { recursive: true });

// Pre-seed an existing settings.local.json with an unrelated hook, to verify backup + merge.
const settingsDir = path.join(fakeProjectRoot, '.claude');
mkdirSync(settingsDir, { recursive: true });
const settingsFile = path.join(settingsDir, 'settings.local.json');
writeFileSync(settingsFile, JSON.stringify({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'pre-existing' }] }] } }));

const result = installClaudeCodeHooks('project', fakeProjectRoot);
check('writes to the expected scratch path', result.path === settingsFile);
check('backs up pre-existing file', result.backedUp === true);

const written = JSON.parse(readFileSync(settingsFile, 'utf8'));
check('written file has engram hooks', written.hooks.SessionStart[0].hooks[0].command === 'engram hook sessionstart');
check('written file preserves pre-existing hook', written.hooks.Stop.some((m: any) => m.hooks.some((h: any) => h.command === 'pre-existing')));

const backup = JSON.parse(readFileSync(`${settingsFile}.bak`, 'utf8'));
check('backup file matches original pre-install content', backup.hooks.Stop[0].hooks[0].command === 'pre-existing' && !backup.hooks.SessionStart);

rmSync(scratchDir, { recursive: true, force: true });

// 5. mergeMcpServer (shared by Cursor/Gemini CLI/Claude Desktop): preserves sibling server entries.
const mcpMerged = mergeMcpServer(
  { mcpServers: { 'some-other-server': { command: 'foo', args: [] } } },
  'engram',
  { command: 'node', args: ['/path/to/server.js'], env: { ENGRAM_TOOL: 'cursor' } },
);
check('preserves sibling MCP server entries', !!mcpMerged.mcpServers['some-other-server']);
check('adds engram MCP entry', mcpMerged.mcpServers.engram.env.ENGRAM_TOOL === 'cursor');

// 6. installCursor against a scratch project root (NEVER the real ~/.cursor).
const cursorScratch = mkdtempSync(path.join(tmpdir(), 'engram-cursor-test-'));
const cursorResult = installCursor('project', cursorScratch);
check('installCursor writes to .cursor/mcp.json under project root', cursorResult.path === path.join(cursorScratch, '.cursor', 'mcp.json'));
const cursorConfig = JSON.parse(readFileSync(cursorResult.path, 'utf8'));
check('installCursor sets ENGRAM_TOOL=cursor', cursorConfig.mcpServers.engram.env.ENGRAM_TOOL === 'cursor');
check('installCursor sets ENGRAM_CWD to project root', cursorConfig.mcpServers.engram.env.ENGRAM_CWD === cursorScratch);
rmSync(cursorScratch, { recursive: true, force: true });

// 7. installGeminiCli against a scratch project root (NEVER the real ~/.gemini).
const geminiScratch = mkdtempSync(path.join(tmpdir(), 'engram-gemini-test-'));
const geminiResult = installGeminiCli('project', geminiScratch);
check('installGeminiCli writes to .gemini/settings.json under project root', geminiResult.path === path.join(geminiScratch, '.gemini', 'settings.json'));
const geminiConfig = JSON.parse(readFileSync(geminiResult.path, 'utf8'));
check('installGeminiCli sets ENGRAM_TOOL=gemini-cli', geminiConfig.mcpServers.engram.env.ENGRAM_TOOL === 'gemini-cli');
check('installGeminiCli sets cwd field directly', geminiConfig.mcpServers.engram.cwd === geminiScratch);
rmSync(geminiScratch, { recursive: true, force: true });

// 8. ensureRulesSnippet: creates, is idempotent, and preserves existing content when appending.
const rulesScratch = mkdtempSync(path.join(tmpdir(), 'engram-rules-test-'));
const agentsFile = path.join(rulesScratch, 'AGENTS.md');
const firstAdd = ensureRulesSnippet(agentsFile);
check('creates AGENTS.md with the snippet', firstAdd.added === true);
const secondAdd = ensureRulesSnippet(agentsFile);
check('idempotent — no duplicate snippet on re-run', secondAdd.added === false);

writeFileSync(agentsFile, '# My existing project notes\n\nSome content a human wrote.\n');
const thirdAdd = ensureRulesSnippet(agentsFile);
const finalContent = readFileSync(agentsFile, 'utf8');
check('appends without clobbering existing content', thirdAdd.added === true && finalContent.includes('My existing project notes') && finalContent.includes('engram_recall'));
rmSync(rulesScratch, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n❌ ${failures} install test(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\n✅ all install tests passed');
}
