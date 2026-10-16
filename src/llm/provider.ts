import { z } from 'zod';
import { loadConfig } from '../config.js';

export interface CompleteOptions {
  system: string;
  user: string;
  /** Ask the provider to guarantee valid JSON back, when it supports it. */
  jsonMode?: boolean;
}

export interface LlmProvider {
  readonly name: string;
  complete(opts: CompleteOptions): Promise<string>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

/**
 * Calls the provider in JSON mode, strips markdown fences the model might add anyway, validates
 * against the given zod schema, and retries once on any failure (malformed JSON or schema mismatch) —
 * per T4.1's "make the JSON output robust" requirement. Groq's gpt-oss-120b uses best-effort
 * json_object mode, not a schema-enforced mode, so this validation layer is load-bearing, not optional.
 */
export async function completeJsonValidated<T>(
  provider: LlmProvider,
  opts: { system: string; user: string },
  schema: z.ZodType<T, any, any>,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const raw = await provider.complete({ ...opts, jsonMode: true });
      const parsed = JSON.parse(stripCodeFences(raw));
      return schema.parse(parsed);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `LLM JSON output failed validation after ${maxAttempts} attempt(s): ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

export async function getLlmProvider(): Promise<LlmProvider> {
  const config = loadConfig();
  switch (config.llmProvider) {
    case 'groq': {
      const { GroqProvider } = await import('./groq.js');
      return new GroqProvider(config.groqApiKey);
    }
    default:
      throw new Error(
        `Unsupported LLM_PROVIDER "${config.llmProvider}" — only "groq" is wired up so far. ` +
          `Set LLM_PROVIDER=groq and GROQ_API_KEY in .env.`,
      );
  }
}
