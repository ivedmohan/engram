import { redactSecrets } from '../src/memory/redact.js';

const cases: Array<{ name: string; input: string; mustRedact: boolean }> = [
  { name: 'anthropic key', input: 'my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456', mustRedact: true },
  { name: 'groq key', input: 'GROQ_API_KEY=gsk_NOTAREALKEYNOTAREALKEYNOTAREALKEYFAKE00', mustRedact: true },
  { name: 'openai key', input: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890', mustRedact: true },
  { name: 'google api key', input: 'AIzaSyD-abcdefghijklmnopqrstuvwxyz1234567', mustRedact: true },
  { name: 'github token', input: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890', mustRedact: true },
  { name: 'slack token', input: 'xoxb-NOT-A-REAL-TOKEN-FAKE-FOR-TESTING-0000', mustRedact: true },
  { name: 'aws access key', input: 'AKIAIOSFODNN7EXAMPLE', mustRedact: true },
  { name: 'eth private key', input: '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318', mustRedact: true },
  { name: 'jwt', input: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ_abc123def456', mustRedact: true },
  {
    name: 'pem block',
    input: '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----',
    mustRedact: true,
  },
  { name: 'env-style secret', input: 'DATABASE_PASSWORD=hunter2hunter2', mustRedact: true },
  { name: 'normal text untouched', input: 'Relayer uses Hono, we use pnpm in this repo.', mustRedact: false },
  {
    name: 'ordinary 12-word sentence must NOT be flagged as a mnemonic',
    input: 'The quick brown fox jumps over the lazy dog near the old barn',
    mustRedact: false,
  },
  {
    name: 'nonsense 12-word run with no common words IS flagged as a possible mnemonic',
    input: 'zebra toast violin cactus plumber rocket wizard canyon velvet marble ostrich lantern',
    mustRedact: true,
  },
];

let failures = 0;
for (const c of cases) {
  const { text, found } = redactSecrets(c.input);
  const wasRedacted = found.length > 0;
  const pass = wasRedacted === c.mustRedact;
  console.log(`${pass ? '✅' : '❌'} ${c.name}: expected redact=${c.mustRedact}, got=${wasRedacted}${wasRedacted ? ` [${found.join(',')}]` : ''}`);
  if (!pass) failures++;
  if (c.mustRedact && text === c.input) {
    console.log(`   ⚠️  found a match but text wasn't actually replaced`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} redact test(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\n✅ all redact tests passed');
}
