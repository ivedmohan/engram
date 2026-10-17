# Engram demo video

A ~1:48, 1080p demo built with [Remotion](https://www.remotion.dev/), narrated with ElevenLabs. The end screen links to
[engram-folkdb.vercel.app](https://engram-folkdb.vercel.app/).

```bash
npm install
npm run studio     # live preview / scrub in the browser
npm run render     # -> out/engram-demo.mp4
```

## How it fits together

- `src/narration.json` — the voiceover script, one entry per scene.
- `scripts/voiceover.mjs` — sends each entry to ElevenLabs, writes `public/<scene>.mp3`, and records
  clip lengths in `src/durations.json`. Every scene's length follows its narration, so editing a line
  and re-running this is all it takes to re-time the video:
  ```bash
  ELEVENLABS_API_KEY=... npm run voiceover
  ```
- `public/ui-graph.png`, `public/ui-hono.png`, `src/ui-positions.json` — real screenshots of the
  running web UI (`http://127.0.0.1:7777`, `demo-relayer` project after `npm run seed-demo`), at a
  1440×810 viewport, plus the on-screen positions of the nodes/panels the cursor and highlights target.
  Re-capture them if the UI changes.
- `src/recall.json` — the real `/recall` response shown in the terminal scene.

Scenes 2 (Claude Code session) and 3 (write-path pipeline) are illustrations of what the hook and
daemon do; scenes 4–6 show real output and the real UI.
