// Generates one ElevenLabs narration clip per scene into public/, and records each clip's duration in
// src/durations.json so the composition times every scene to its voiceover.
// Usage: ELEVENLABS_API_KEY=... npm run voiceover   (VOICE_ID optional, defaults to "George")
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb';
const scenes = JSON.parse(fs.readFileSync('src/narration.json', 'utf8'));
const skipTts = process.argv.includes('--durations-only');
if (!key && !skipTts) throw new Error('Set ELEVENLABS_API_KEY');

const durations = {};
for (const s of scenes) {
  const out = `public/${s.id}.mp3`;
  if (!skipTts) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: s.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15 } }),
    });
    if (!res.ok) throw new Error(`${s.id}: ${res.status} ${await res.text()}`);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  }
  durations[s.id] = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  console.log(s.id, durations[s.id].toFixed(2) + 's');
}
fs.writeFileSync('src/durations.json', JSON.stringify(durations, null, 2) + '\n');
