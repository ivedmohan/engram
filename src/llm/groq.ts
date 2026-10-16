import Groq from 'groq-sdk';
import type { CompleteOptions, LlmProvider } from './provider.js';

// gpt-oss-120b, not Kimi K2: Kimi K2 isn't enabled on every Groq account/tier (404s even though
// it's a real, documented model), and gpt-oss-120b is on Groq's strict json_schema whitelist
// (guaranteed valid JSON) while Kimi K2 is only best-effort json_object. Swap via GROQ_MODEL if
// your account has Kimi K2 access and you want it.
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  private client: Groq;
  private model: string;

  constructor(apiKey?: string, model: string = process.env.GROQ_MODEL || DEFAULT_MODEL) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('GROQ_API_KEY is not set. Add it to .env or pass a per-user key explicitly.');
    }
    this.client = new Groq({ apiKey: key });
    this.model = model;
  }

  async complete({ system, user, jsonMode }: CompleteOptions): Promise<string> {
    // Kimi K2 isn't on Groq's strict-json_schema whitelist, so this is best-effort JSON —
    // callers MUST validate the result (e.g. with zod) and retry on failure, per T4.1.
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      temperature: 0.2,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('groq: empty completion response');
    return content;
  }
}
