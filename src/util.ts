import { createHash } from 'node:crypto';

export function hashText(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 24);
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where',
  'do', 'does', 'did', 'done', 'doing',
  'use', 'uses', 'used', 'using',
  'to', 'of', 'in', 'on', 'for', 'with', 'about', 'this', 'that', 'these', 'those',
  'i', 'we', 'you', 'your', 'our', 'my', 'it', 'its', 'and', 'or', 'but',
  'can', 'could', 'would', 'should', 'will', 'shall',
]);

/**
 * FalkorDB's full-text index is RediSearch-backed: a plain multi-word string is parsed
 * as an implicit AND/phrase match, so a natural-language question (which shares few exact
 * words with the stored memory text) returns nothing. Turn it into an OR query over the
 * meaningful keywords instead — RediSearch OR syntax is `word1|word2|word3`.
 * Returns '' if nothing meaningful survives (caller should skip the fulltext call then).
 */
export function toFulltextQuery(text: string): string {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return Array.from(new Set(terms)).join('|');
}
