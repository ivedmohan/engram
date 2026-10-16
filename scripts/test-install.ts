import { mergeEngramHooks } from '../src/install/claude-code.js';
import { installClaudeCodeHooks } from '../src/install/claude-code.js';
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

if (failures > 0) {
  console.error(`\n❌ ${failures} install test(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\n✅ all install tests passed');
}
