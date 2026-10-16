import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';

const MARKER = '<!-- engram:rules-snippet -->';

const SNIPPET = `${MARKER}
## Shared memory (Engram)

This project's decisions and preferences are stored in a shared memory graph (Engram), readable by
every AI tool on this machine — not just this one.

- At the start of a task, call \`engram_recall\` to check for existing decisions, conventions, and
  preferences before assuming or re-deciding something that may already be settled.
- When you make a decision, or the user states a standing preference, call \`engram_remember\` so
  other tools can see it later.
${MARKER}
`;

/**
 * Appends the Engram tool-usage nudge to a rules file (AGENTS.md, GEMINI.md, ...) without an
 * automatic-hooks mechanism to rely on instead. Idempotent (checks the marker before appending) and
 * additive-only — never overwrites existing content in the file.
 */
export function ensureRulesSnippet(filePath: string): { added: boolean } {
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf8');
    if (content.includes(MARKER)) return { added: false };
    appendFileSync(filePath, `\n${SNIPPET}`);
    return { added: true };
  }
  writeFileSync(filePath, SNIPPET);
  return { added: true };
}
