# Demo video script

Target: 2–3 minutes. Follows PLAN.md §2 using the seed-demo path (reliable, no live LLM call on
camera) plus a real MCP recall call. An optional upgrade to a fully-live Cursor demo is noted at the
bottom.

## Before you hit record

1. **Clean up your screen.** System Settings → Focus → turn on Do Not Disturb (kills notification
   popups mid-recording). Close unrelated tabs/apps. Hide the menu bar clock if you don't want a
   timestamp visible (System Settings → Control Center → Clock → uncheck "Show in Menu Bar", or just
   don't worry about it).
2. **Make sure the stack is running:**
   ```bash
   cd /Users/vedmohan/Projects/engram
   docker compose ps          # engram-falkordb should be "Up"
   curl http://127.0.0.1:7777/health   # should return {"ok":true,...}
   ```
   If the daemon isn't running: `node dist/cli.js up` (or `npm run dev:daemon` for the dev version).
3. **Reset the demo data to a clean state** (so the video shows exactly this, reproducibly):
   ```bash
   # find and delete the existing demo-relayer graph, then reseed
   docker exec engram-falkordb redis-cli GRAPH.LIST
   # delete the one matching demo-relayer-* if you want a fully fresh run, e.g.:
   # docker exec engram-falkordb redis-cli GRAPH.DELETE engram_p_demo-relayer-a9011f1f
   npm run seed-demo
   ```
4. **Open two windows side by side** (or use Spaces/full-screen switching): Claude Code (or a terminal)
   on one side, your browser on the other, pointed at `http://127.0.0.1:7777` but not yet loaded.
5. Decide on narration: either talk live while recording (Cmd+Shift+5 lets you pick a mic), or record
   the screen silently and voice over afterward in iMovie (free, already on your Mac — screen-only
   takes are easier to get clean, then you can redo narration without redoing clicks).

## How to record (macOS, built-in, free)

- **Cmd+Shift+5** opens the screen recording toolbar.
- Choose "Record Selected Portion" and drag a box around just your terminal+browser area, or
  "Record Entire Screen" if you've already arranged your windows.
- Click the **Options** menu in the toolbar to pick a microphone if narrating live, and to choose
  where the file saves.
- Click Record. Stop via the stop icon in the menu bar, or Cmd+Shift+5 again.
- Output is a `.mov` file. For a hackathon submission that expects `.mp4`, open it in QuickTime
  Player and use File → Export As, or run `ffmpeg -i input.mov output.mp4` if you have ffmpeg.

## The script

**[0:00–0:15] Hook — say this over a blank terminal or a title moment**

> "Every AI coding tool you use starts from zero. Decide something in Claude Code, and Cursor has no
> idea it happened. Engram fixes that with one memory graph that every tool reads and writes."

**[0:15–0:40] The scenario — Claude Code**

Open Claude Code in any repo (doesn't need to be a real project — this is just to show the moment
visually; the actual data was already seeded). Type, for real, on camera:

> "Let's switch the relayer from Express to Hono, and we always use pnpm in this repo."

Narration:

> "Normally, ending this session triggers a hook that captures this automatically — no one has to say
> 'remember this.' For this recording I'm using Engram's seed script so the timing lines up exactly,
> but this is the real conversation that produced it."

**[0:40–1:10] Switch to terminal — show the seed and the raw recall**

```bash
npm run seed-demo
```
Let the output print (it's fast, ~1 second). Then:

```bash
curl -s -X POST http://127.0.0.1:7777/recall \
  -H 'content-type: application/json' \
  -d '{"query":"what framework does the relayer use","cwd":"/tmp/demo-relayer"}' | python3 -m json.tool
```

Narration, while the JSON prints:

> "That's a different tool — Cursor, or Gemini CLI — asking what framework the relayer uses. It
> answers Hono, and cites that this replaced Express. No one had to re-explain anything."

**[1:10–1:45] The web UI — the hero shot**

Switch to the browser, load `http://127.0.0.1:7777`. Let the graph render. Click the "Relayer uses
Hono" node.

Narration:

> "This is the actual memory graph. Claude Code's session, Cursor's session — same graph. And here's
> the part a vector store can't do: this edge." *(point at / highlight the orange SUPERSEDES line)*
> "Hono didn't just get added — it explicitly replaced Express. The old memory is still here if you
> need the history, but nobody gets handed a decision that's already been reversed."

**[1:45–2:05] Timeline**

Scroll to or point at the timeline panel on the right.

> "Every tool's contributions, in order, in one place."

**[2:05–2:25] Close**

> "It's local-first — FalkorDB running on your own machine, nothing leaves except the one call to turn
> a conversation into memories. Built for Graph Hacks on FalkorDB. Link's in the description."

## Optional upgrade: a real live Cursor demo instead of curl

Cursor is already installed on this machine. If you want the [1:10] recall moment to be a real Cursor
chat window instead of a terminal curl command (more impressive, slightly more setup risk):

```bash
cd /tmp/demo-relayer   # or any repo you want to demo in
node /Users/vedmohan/Projects/engram/dist/cli.js install cursor --scope project --with-rules
```

This writes `.cursor/mcp.json` (registers Engram as an MCP server, scoped to this folder only) and
appends a nudge to `AGENTS.md` telling Cursor's agent to call `engram_recall` at the start of a task —
without the nudge, Cursor has no automatic trigger to check memory at all. Open Cursor in that folder,
start a chat, ask "what framework does the relayer use?" and let it call the tool live.

This is lower-risk than installing into Claude Code (no automatic hooks firing on every future
session — Cursor only calls the tool when its agent decides to), but it's still a real change to that
project's config, so it's your call whether to do it before recording.
