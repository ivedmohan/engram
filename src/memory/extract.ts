import { getLlmProvider, completeJsonValidated } from '../llm/provider.js';
import { buildExtractionPrompt, ExtractionResultSchema, type ExtractionResult } from '../llm/prompts.js';
import { redactSecrets } from './redact.js';

export async function extractMemories(conversationText: string): Promise<ExtractionResult> {
  const { text: redacted, found } = redactSecrets(conversationText);
  if (found.length > 0) {
    console.log(`[extract] redacted ${found.length} likely secret(s) before sending to LLM: ${found.join(', ')}`);
  }

  const provider = await getLlmProvider();
  const { system, user } = buildExtractionPrompt(redacted);
  return completeJsonValidated(provider, { system, user }, ExtractionResultSchema);
}
