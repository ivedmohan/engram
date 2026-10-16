import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface EngramConfig {
  port: number;
  falkordb: { host: string; port: number; username?: string; password?: string };
  llmProvider: string;
  /** Only Groq supports a user-supplied key for now (see PLAN.md T4.1). */
  groqApiKey?: string;
  embedding: { provider: string; model: string; dim: number };
}

const DEFAULTS: EngramConfig = {
  port: 7777,
  falkordb: { host: 'localhost', port: 6379 },
  llmProvider: 'groq',
  embedding: { provider: 'ollama', model: 'nomic-embed-text', dim: 768 },
};

export const ENGRAM_HOME = path.join(homedir(), '.engram');
const CONFIG_PATH = path.join(ENGRAM_HOME, 'config.json');

function loadConfigFile(): Partial<EngramConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function loadConfig(): EngramConfig {
  const file = loadConfigFile();
  return {
    port: Number(process.env.ENGRAM_PORT || file.port || DEFAULTS.port),
    falkordb: {
      host: process.env.FALKORDB_HOST || file.falkordb?.host || DEFAULTS.falkordb.host,
      port: Number(process.env.FALKORDB_PORT || file.falkordb?.port || DEFAULTS.falkordb.port),
      username: process.env.FALKORDB_USERNAME || file.falkordb?.username,
      password: process.env.FALKORDB_PASSWORD || file.falkordb?.password,
    },
    llmProvider: process.env.LLM_PROVIDER || file.llmProvider || DEFAULTS.llmProvider,
    groqApiKey: process.env.GROQ_API_KEY || file.groqApiKey,
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER || file.embedding?.provider || DEFAULTS.embedding.provider,
      model: process.env.EMBEDDING_MODEL || file.embedding?.model || DEFAULTS.embedding.model,
      dim: Number(process.env.EMBEDDING_DIM || file.embedding?.dim || DEFAULTS.embedding.dim),
    },
  };
}

export function ensureEngramHome(): void {
  if (!existsSync(ENGRAM_HOME)) mkdirSync(ENGRAM_HOME, { recursive: true });
}

/** Loads .env from the current working directory if present. Safe to call multiple times. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — fine, config falls back to defaults / real env vars
  }
}
