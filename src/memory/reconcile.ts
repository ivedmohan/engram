import type { Graph } from 'falkordb';
import { getLlmProvider, completeJsonValidated } from '../llm/provider.js';
import { buildReconciliationPrompt, ReconciliationResultSchema, type ReconciliationResult } from '../llm/prompts.js';
import { fulltextSearch, entityExpand } from '../graph/queries.js';
import { toFulltextQuery } from '../util.js';

/**
 * Finds existing active memories plausibly related to a candidate, for the LLM to reconcile against.
 * No embeddings are wired yet (T4.5/Ollama), so this relies on fulltext overlap + shared entities —
 * the same two signals /recall already uses, just scoped down to a handful of candidates.
 */
export async function findSimilarMemories(
  graph: Graph,
  candidateText: string,
  candidateEntityNames: string[],
): Promise<Array<{ id: string; text: string }>> {
  const results = new Map<string, { id: string; text: string }>();

  const ftQuery = toFulltextQuery(candidateText);
  if (ftQuery) {
    const ft = await fulltextSearch(graph, ftQuery, 5);
    for (const r of ft) {
      const m = r.memory as any;
      if (m) results.set(m.id, { id: m.id, text: m.text });
    }
  }

  if (candidateEntityNames.length > 0) {
    const expanded = await entityExpand(graph, candidateEntityNames, 1);
    for (const m of expanded as any[]) results.set(m.id, { id: m.id, text: m.text });
  }

  return Array.from(results.values()).slice(0, 8);
}

export async function reconcile(
  graph: Graph,
  candidateText: string,
  candidateEntityNames: string[],
): Promise<ReconciliationResult> {
  const existing = await findSimilarMemories(graph, candidateText, candidateEntityNames);
  if (existing.length === 0) {
    return { action: 'ADD', memoryId: null, reason: null };
  }

  const provider = await getLlmProvider();
  const { system, user } = buildReconciliationPrompt(candidateText, existing);
  return completeJsonValidated(provider, { system, user }, ReconciliationResultSchema);
}
