# CLAUDE.md — Engram (working name)

> Local-first, graph-based shared memory for every AI tool on your machine.
> Claude Code, Cursor, Antigravity, Gemini CLI, Claude Desktop (and later web chats)
> all read and write ONE memory graph, stored in FalkorDB on the user's own machine.

This file is read automatically by Claude Code at the start of every session.
The full task plan lives in `PLAN.md`. Progress lives in `PROGRESS.md`.

---

## 0. Before you do anything in a session

1. Read `PLAN.md` (the spec + task list) and `PROGRESS.md` (what's done, what's next).
2. Pick the **first unchecked task** in `PLAN.md` whose dependencies are done, unless Ved says otherwise.
3. If the task has a `RESEARCH` note, verify the API against official docs first
   (use web search / web fetch). **Do not trust memory for library APIs** — MCP SDK,
   FalkorDB client, Claude Code hooks and client config paths change often.
4. When a task is done: tick its checkbox in `PLAN.md`, add a short entry to
   `PROGRESS.md` (what was built, files touched, anything surprising), and make a git commit.

## 1. Hard constraints (hackathon rules)

- Event: **Graph Hacks: Context for AI Agents** (WeMakeDevs × FalkorDB).
  **Submissions close 18 Oct 2026, 11:59 PM IST.** Aim to be feature-complete by the evening of 18 Oct
  (Delhi time) with time left for the demo video and README.
- **FalkorDB must be the primary graph database and central to the product.** The graph must shape
  what the agents get back, not sit on the side.
- The FalkorDB implementation must be **new work done during the event**. General libraries are fine.
  Do NOT use Graphiti, mem0, Cognee, Zep or similar as the core memory engine — we build that ourselves.
- Target track: **Track 02 — Agent Memory and Coordination** (secondary fit: Track 03).
- Preferred: a live deployment. Otherwise: complete local setup instructions + working demo video.
- Check the official rules page before submitting: https://www.wemakedevs.org/hackathons/falkordb/rules

## 2. Stack (decided — don't relitigate)

- **Language:** TypeScript (Node 20+), ESM. Run dev with `tsx`, build with `tsc`.
- **Graph DB:** FalkorDB via Docker (`falkordb/falkordb:latest`, port 6379; FalkorDB Browser on 3000).
- **FalkorDB client:** `falkordb` npm package.
- **MCP:** `@modelcontextprotocol/sdk` (stdio transport) + `zod` for tool schemas.
- **Daemon HTTP server:** Hono on Node (`hono` + `@hono/node-server`), bound to `127.0.0.1` only.
- **LLM + embeddings:** pluggable provider interface. Defaults: an API-key provider for extraction
  (Anthropic / OpenAI / Gemini, whichever key is set) and **Ollama** as the fully-local option.
- **Web UI:** static HTML + vanilla JS served by the daemon, graph drawn with a CDN graph library
  (e.g. cytoscape.js or force-graph). No frontend build step.
- **Package manager:** npm. Single package; the browser extension (stretch) lives in `/extension`.

## 3. Architecture in one picture

```
Claude Code ─┐ (MCP stdio + hooks)
Cursor ──────┤ (MCP stdio)
Antigravity ─┤ (MCP stdio)            ┌─────────────────────────────┐
Gemini CLI ──┤ (MCP stdio)  ──HTTP──▶ │ engram daemon (127.0.0.1)    │
Claude Desk.─┘                        │ - REST API                   │
Browser ext (stretch) ──HTTP────────▶ │ - extraction queue + worker  │──▶ FalkorDB (Docker)
                                      │ - recall / ranking           │    graphs:
                                      │ - web UI (graph + timeline)  │    engram_global
                                      └─────────────────────────────┘    engram_p_<project>
```

Key design rule: **the daemon is the only writer.** MCP servers, hooks and the extension are thin
clients that call the daemon's HTTP API. This avoids several MCP processes racing on writes.

## 4. Conventions

- Source layout is defined in `PLAN.md §4`. Keep to it.
- Every Cypher query lives in `src/graph/queries.ts` as a named, parameterised constant.
  Never string-concatenate user text into Cypher — always pass params.
- All IDs are ULIDs (`ulid` package). All timestamps are epoch milliseconds (numbers).
- Config via `~/.engram/config.json` + env vars (env wins). Data dir: `~/.engram/`.
- Log to stderr in MCP processes (stdout is the MCP protocol channel — never `console.log` there).
- **Redact secrets before anything is stored or sent to an LLM** (API keys, tokens, private keys,
  `.env` contents). See task T4.2.
- Keep functions small and typed. No `any` unless commented why.
- Write a quick test or a runnable script for each core module (`npm run smoke`).

## 5. Commands (keep this section updated as they are created)

```bash
docker compose up -d          # FalkorDB
npm run dev:daemon            # daemon on http://127.0.0.1:7777
npm run build                 # compile to dist/
npm run smoke                 # end-to-end smoke test
npx engram install claude-code   # register MCP + hooks
npx engram status
```

## 6. Dogfooding

As soon as T3 (MCP) and T5 (hooks) work, install Engram into THIS repo's Claude Code setup and use it
while building. Real memories from building Engram make the best demo data.

## 7. When unsure

Prefer the smallest thing that makes the demo flow in `PLAN.md §2` work end to end.
Stretch tasks are only touched after every MUST task is checked off.
If a decision is genuinely ambiguous, write the options in `PROGRESS.md` under "Open questions"
and ask Ved instead of guessing.
