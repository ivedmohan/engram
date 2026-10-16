import type { Graph } from 'falkordb';
import { createMemory, supersede, contradict, findMemoryByHash, upsertSession } from '../graph/queries.js';
import { hashText } from '../util.js';
import type { ExtractionResult } from '../llm/prompts.js';
import { reconcile } from './reconcile.js';

export interface SessionContext {
  sessionId: string;
  tool: string;
  cwd: string;
  projectSlug: string;
  projectName: string;
  projectRoot: string;
}

export interface WriteOutcome {
  id: string;
  action: 'ADD' | 'DUPLICATE' | 'DUPLICATE_HASH' | 'SUPERSEDE' | 'CONTRADICT';
  relatedId?: string;
}

/**
 * Writes every extracted candidate memory to its target graph (project or global, per the
 * candidate's own scope), reconciling each one against existing memories first. A global-scope
 * memory needs its own Session node in engram_global too, since createMemory's Cypher MATCHes the
 * session in whichever graph it's writing to.
 */
export async function writeExtractedMemories(
  projectGraph: Graph,
  globalGraph: Graph,
  ctx: SessionContext,
  extraction: ExtractionResult,
): Promise<WriteOutcome[]> {
  const outcomes: WriteOutcome[] = [];
  let globalSessionEnsured = false;

  for (const candidate of extraction.memories) {
    const targetGraph = candidate.scope === 'global' ? globalGraph : projectGraph;

    if (candidate.scope === 'global' && !globalSessionEnsured) {
      await upsertSession(globalGraph, {
        id: ctx.sessionId,
        tool: ctx.tool,
        cwd: ctx.cwd,
        projectSlug: ctx.projectSlug,
        projectName: ctx.projectName,
        projectRoot: ctx.projectRoot,
      });
      globalSessionEnsured = true;
    }

    const hash = hashText(candidate.text);
    const existingByHash = await findMemoryByHash(targetGraph, hash);
    if (existingByHash) {
      outcomes.push({ id: existingByHash.id, action: 'DUPLICATE_HASH' });
      continue;
    }

    const entityNames = candidate.entities.map((e) => e.name);
    const decision = await reconcile(targetGraph, candidate.text, entityNames);

    if (decision.action === 'DUPLICATE' && decision.memoryId) {
      outcomes.push({ id: decision.memoryId, action: 'DUPLICATE' });
      continue;
    }

    const newId = await createMemory(targetGraph, {
      text: candidate.text,
      kind: candidate.kind,
      confidence: candidate.confidence,
      hash,
      sessionId: ctx.sessionId,
      entities: candidate.entities,
    });

    if (decision.action === 'SUPERSEDE' && decision.memoryId) {
      await supersede(targetGraph, newId, decision.memoryId, decision.reason || 'superseded by newer information');
      outcomes.push({ id: newId, action: 'SUPERSEDE', relatedId: decision.memoryId });
    } else if (decision.action === 'CONTRADICT' && decision.memoryId) {
      await contradict(targetGraph, newId, decision.memoryId);
      outcomes.push({ id: newId, action: 'CONTRADICT', relatedId: decision.memoryId });
    } else {
      outcomes.push({ id: newId, action: 'ADD' });
    }
  }

  return outcomes;
}
