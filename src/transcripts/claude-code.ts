import { readFileSync } from 'node:fs';

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

/**
 * Parses a Claude Code JSONL transcript. Schema confirmed by inspecting a real transcript file
 * directly (not from docs, which don't publish this format): each line is
 * `{type: "user"|"assistant"|..., message: {role, content}, timestamp, ...}`.
 *
 * - `type: "user"` with a STRING `message.content` is real human text — keep it.
 * - `type: "user"` with an ARRAY `message.content` is tool-result feedback being fed back in, not
 *   something a person typed — drop it (this is the "tool-call noise" T5.2 calls out).
 * - `type: "assistant"` always has an array `message.content` of blocks: `thinking` (drop — internal),
 *   `tool_use` (drop — not conversational), `text` (keep — this is the assistant's visible reply).
 * - Every other top-level `type` (system, file-history-snapshot, mode, ...) is harness bookkeeping,
 *   not conversation — drop entirely.
 *
 * `startLine` lets a caller resume from where it left off (Session.processedOffset) instead of
 * re-parsing the whole file on every Stop hook firing.
 */
export function parseTranscriptText(
  jsonlContent: string,
  startLine = 0,
): { messages: TranscriptMessage[]; totalLines: number } {
  const lines = jsonlContent.split('\n');
  const messages: TranscriptMessage[] = [];

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const msg = entry.message;
    if (!msg) continue;
    const ts = entry.timestamp ? Date.parse(entry.timestamp) : Date.now();

    if (entry.type === 'user') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        messages.push({ role: 'user', text: msg.content.trim(), ts });
      }
      continue;
    }

    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c: any) => c?.type === 'text' && typeof c.text === 'string' && c.text.trim())
        .map((c: any) => c.text.trim());
      if (textParts.length > 0) {
        messages.push({ role: 'assistant', text: textParts.join('\n'), ts });
      }
    }
  }

  return { messages, totalLines: lines.length };
}

export function parseTranscriptFile(
  path: string,
  startLine = 0,
): { messages: TranscriptMessage[]; totalLines: number } {
  const content = readFileSync(path, 'utf8');
  return parseTranscriptText(content, startLine);
}
