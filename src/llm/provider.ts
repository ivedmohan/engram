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
