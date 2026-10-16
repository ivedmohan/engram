import { z } from 'zod';

// ---------------------------------------------------------------------------
// Extraction: raw conversation -> candidate memories
// ---------------------------------------------------------------------------

export const ExtractionResultSchema = z.object({
  memories: z.array(
    z.object({
      text: z.string().min(1),
      kind: z.enum(['fact', 'decision', 'preference', 'task', 'context']),
      scope: z.enum(['project', 'global']),
      confidence: z.number().min(0).max(1),
      entities: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
    }),
  ),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

const EXTRACTION_SYSTEM_PROMPT = `You extract durable memories from a software engineering conversation so other AI coding tools (running in different sessions, sometimes different tools entirely) can read them later.

Rules:
- Only extract facts, decisions, or preferences that are durable and reusable across future sessions. Skip chit-chat, transient errors that got fixed, questions, and anything already obvious from reading the code.
- Each memory is ONE atomic statement, present tense, describing the resulting state — not the change itself. Write "Relayer uses Hono", not "We decided to switch to Hono" or "Switched the relayer to Hono".
- kind: "decision" for an explicit architectural/tooling choice, "preference" for a standing rule or convention, "fact" for a neutral fact about the project, "task" for an open action item, "context" for lower-priority background worth keeping.
- scope: "global" ONLY when the statement is clearly about the user's preference across ALL their projects, not just this one (e.g. "I always prefer pnpm over npm" said generally). Otherwise "project". When in doubt, use "project".
- List the entities each memory mentions: name (as written) and type (one of: library, service, person, concept, command, env, file).
- confidence: 0 to 1 — how explicitly this was actually stated, not inferred or guessed.
- If nothing durable was said in this turn, return {"memories": []}. Do not invent memories to fill space.

Return ONLY JSON, no prose, no markdown code fences, matching exactly:
{"memories": [{"text": string, "kind": "fact"|"decision"|"preference"|"task"|"context", "scope": "project"|"global", "confidence": number, "entities": [{"name": string, "type": string}]}]}

Examples:

Input: User: "Let's switch the relayer from Express to Hono, and we always use pnpm in this repo."
Output: {"memories": [{"text": "Relayer uses Hono", "kind": "decision", "scope": "project", "confidence": 0.95, "entities": [{"name": "Hono", "type": "library"}, {"name": "relayer", "type": "concept"}]}, {"text": "Always use pnpm in this repo", "kind": "preference", "scope": "project", "confidence": 0.9, "entities": [{"name": "pnpm", "type": "command"}]}]}

Input: Assistant: "I ran the tests and fixed a typo in the import path." User: "thanks, looks good"
Output: {"memories": []}

Input: User: "I always write commit messages in present tense, across all my projects, not just this one."
Output: {"memories": [{"text": "Writes commit messages in present tense", "kind": "preference", "scope": "global", "confidence": 0.9, "entities": [{"name": "commit messages", "type": "concept"}]}]}`;

export function buildExtractionPrompt(conversationText: string): { system: string; user: string } {
  return { system: EXTRACTION_SYSTEM_PROMPT, user: conversationText };
}

// ---------------------------------------------------------------------------
// Reconciliation: candidate vs. existing memories -> ADD / DUPLICATE / SUPERSEDE / CONTRADICT
// ---------------------------------------------------------------------------

export const ReconciliationResultSchema = z.object({
  action: z.enum(['ADD', 'DUPLICATE', 'SUPERSEDE', 'CONTRADICT']),
  memoryId: z.string().nullable(),
  reason: z.string().nullable(),
});
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

const RECONCILIATION_SYSTEM_PROMPT = `You reconcile a NEW candidate memory against a project's EXISTING active memories, so a shared memory graph used by several AI tools never ends up with duplicate or contradictory entries.

Classify the candidate as exactly ONE of:
- "ADD": genuinely new information, not meaningfully related to any existing memory listed.
- "DUPLICATE": restates an existing memory with no new information. memoryId = that memory's id.
- "SUPERSEDE": the candidate is a more current statement about the SAME specific topic/entity as an existing memory — it replaces or updates that memory going forward. memoryId = the OLD memory's id being replaced, reason = a short phrase explaining the change.
- "CONTRADICT": the candidate conflicts with an existing memory, but there's no clear signal that one supersedes the other (e.g. ambiguous ordering, or it reads like disagreement rather than a deliberate change) — flag for human review rather than silently overwriting. memoryId = the conflicting memory's id.

Return ONLY JSON, no prose: {"action": "ADD"|"DUPLICATE"|"SUPERSEDE"|"CONTRADICT", "memoryId": string|null, "reason": string|null}
memoryId and reason are null for "ADD".

Examples:

Candidate: "Always use pnpm in this repo"
Existing: (none)
Output: {"action": "ADD", "memoryId": null, "reason": null}

Candidate: "Relayer uses Hono"
Existing: [{"id": "m1", "text": "Relayer uses Express"}]
Output: {"action": "SUPERSEDE", "memoryId": "m1", "reason": "Switched relayer framework from Express to Hono"}

Candidate: "The relayer uses Hono as its framework"
Existing: [{"id": "m2", "text": "Relayer uses Hono"}]
Output: {"action": "DUPLICATE", "memoryId": "m2", "reason": null}

Candidate: "We use npm for this project"
Existing: [{"id": "m3", "text": "Always use pnpm in this repo"}]
Output: {"action": "CONTRADICT", "memoryId": "m3", "reason": "States npm where an existing memory states pnpm, with no indication this is a deliberate change"}`;

export function buildReconciliationPrompt(
  candidateText: string,
  existing: Array<{ id: string; text: string }>,
): { system: string; user: string } {
  const user =
    `Candidate: "${candidateText}"\n` +
    `Existing: ${existing.length === 0 ? '(none)' : JSON.stringify(existing.map((e) => ({ id: e.id, text: e.text })))}`;
  return { system: RECONCILIATION_SYSTEM_PROMPT, user };
}
