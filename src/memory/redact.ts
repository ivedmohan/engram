interface SecretPattern {
  name: string;
  pattern: RegExp;
}

// Order matters for overlapping patterns (e.g. JWTs can contain base64 that looks like other things) —
// more specific patterns run first.
const PATTERNS: SecretPattern[] = [
  { name: 'pem-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'jwt', pattern: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'groq-key', pattern: /\bgsk_[A-Za-z0-9]{20,}\b/g },
  { name: 'openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{20,40}\b/g },
  { name: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-pat', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'eth-private-key', pattern: /\b0x[a-fA-F0-9]{64}\b/g },
  // KEY=value / "key": "value" lines where the name looks sensitive
  {
    name: 'env-style-secret',
    pattern: /\b([A-Za-z_][A-Za-z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_?KEY)[A-Za-z0-9_]*)\s*[:=]\s*["']?[^\s"'#]{6,}["']?/gi,
  },
];

// 12 or 24 lowercase words in a row — heuristic for a BIP-39 seed phrase, handled separately from
// PATTERNS because a plain regex over-fires on ordinary prose ("the quick brown fox jumps over the
// lazy dog near the old barn" is 12 lowercase words). A real mnemonic never contains common function
// words (the/a/is/we/to/...), so reject any candidate run that does — cuts false positives sharply
// while still catching genuine nonsense-word phrases. Still imprecise by nature; that's the accepted
// tradeoff (over-redaction is the safe failure mode here, never under-redaction).
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for', 'with',
  'and', 'or', 'but', 'we', 'you', 'i', 'it', 'this', 'that', 'our', 'your', 'my', 'he', 'she', 'they',
  'use', 'uses', 'used', 'always', 'never', 'here', 'there', 'repo', 'project', 'code', 'file',
]);
const MNEMONIC_RUN = /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g;

function redactMnemonics(text: string, found: string[]): string {
  return text.replace(MNEMONIC_RUN, (match) => {
    const words = match.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) return match; // only exact BIP-39 lengths
    if (words.some((w) => COMMON_WORDS.has(w.toLowerCase()))) return match; // looks like real prose
    found.push('possible-mnemonic');
    return `[REDACTED:possible-mnemonic]`;
  });
}

export interface RedactResult {
  text: string;
  found: string[];
}

/**
 * Scrubs likely secrets from text before it is stored or sent to any LLM.
 * Over-redacting is the safe failure mode here — never loosen a pattern to reduce false positives
 * without a concrete reason.
 */
export function redactSecrets(input: string): RedactResult {
  let text = input;
  const found: string[] = [];

  for (const { name, pattern } of PATTERNS) {
    if (pattern.test(text)) found.push(name);
    pattern.lastIndex = 0;
    text = text.replace(pattern, `[REDACTED:${name}]`);
  }

  text = redactMnemonics(text, found);

  return { text, found };
}
