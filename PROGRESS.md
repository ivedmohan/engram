# PROGRESS.md — Engram

## Done

- **2026-10-16 — Feasibility research pass (all T0–T6 `RESEARCH:` flags verified, no code written yet).**
  Verified against current docs/source:
  - FalkorDB npm client (`falkordb` ~v6.2.7): connect/selectGraph/query API, multigraph confirmed.
  - FalkorDB index syntax: range + full-text (DDL form, not procedure form, on 6.x) + vector
    (`CREATE VECTOR INDEX ... OPTIONS {dimension, similarityFunction}`, `db.idx.vector.queryNodes`).
    Gotcha found: `Memory.embedding` must be wrapped `vecf32(...)` on **write**, not just query.
  - `@modelcontextprotocol/sdk` (pin 1.x, currently 1.32.1 — v2 exists on GitHub main but isn't npm
    default yet): `McpServer` + `registerTool()` (not the older `.tool()`) + `StdioServerTransport`.
    MCP "roots" are deprecated as of the newest spec — `ENGRAM_CWD`/explicit config is the primary
    cwd mechanism, not a fallback.
  - Claude Code hooks (code.claude.com/docs/en/hooks): all 5 assumed events exist; `settings.json`
    shape confirmed; `Stop` should use the `last_assistant_message` stdin field (transcript_path can
    lag); `SessionEnd` has a tiny ~1.5s default budget — keep it fire-and-forget; `claude mcp add
    --scope local|project|user -- <command>` confirmed.
  - Client MCP configs: Cursor (`.cursor/mcp.json` / `~/.cursor/mcp.json`) and Gemini CLI
    (`~/.gemini/settings.json`, supports explicit `cwd`) both confirmed and solid. Claude Desktop
    config path confirmed but **no cwd/workspace concept** — global-scope only. **Antigravity has no
    public docs for custom local MCP servers** (only UI-driven remote connectors) — demoted to stretch.
  - Noted but not core to the build: FalkorDB ships its own generic MCP server
    (`@falkordb/mcpserver`, raw Cypher execution only) — confirms the basic wiring is well-trodden but
    doesn't replace Engram's memory-specific layer (extraction, reconciliation, supersession, provenance).
  - `PLAN.md` updated in place with all corrections (§3.4, T1.3/T1.4, T3.1/T3.3, T5.1/T5.3/T5.4,
    T6.1–T6.4, §9 risks).
- Created `PLAN.md` and `CLAUDE.md` at repo root.

- **2026-10-16 — T0 + T1 complete, verified against a live FalkorDB instance.**
  - Repo pushed to github.com/ivedmohan/engram (main branch).
  - `docker compose up -d` running FalkorDB 4.22.1 locally (6379 + Browser UI on 3000).
  - `npm install` clean (114 packages, 0 vulnerabilities).
  - Built `src/graph/client.ts`, `src/project.ts`, `src/graph/schema.ts`, `src/graph/queries.ts`.
  - `scripts/smoke.ts` passes end-to-end: creates a project/session, 3 memories, one supersession
    (Hono→Express), reads back 2 active memories, and `explainMemory` returns the full supersession
    chain with provenance (tool, session, entities).
  - Two real bugs found and fixed while building (not caught by the earlier research pass — these only
    surfaced by actually running code against the database):
    1. `falkordb` package exports `FalkorDB`/`Graph` as **named exports**, not default — a default
       import compiles fine but fails at runtime (`FalkorDB.connect is not a function`).
    2. FalkorDB query results are **objects keyed by RETURN alias** (`{m: ..., score: ...}`), not
       positional tuples. Code assuming tuples runs with no error and silently returns wrong/empty data.
    Also: a Cypher write whose leading `MATCH` finds nothing returns 0 rows with no thrown error —
    `createMemory` now explicitly checks `result.data.length` after the session-match.
  - Also fixed: `scripts/smoke.ts` must call `closeDb()` in a `.finally()`, not after success only, or a
    thrown assertion leaves the FalkorDB socket open and the process hangs forever instead of exiting.

- **2026-10-16 — T2 complete: daemon up, every REST endpoint verified live via curl.**
  - Built `src/config.ts`, `src/daemon/queue.ts`, `src/daemon/routes.ts`, `src/daemon/server.ts`,
    `src/cli.ts`, `src/util.ts` (hashing + fulltext query sanitizing).
  - `client.ts` now calls `ensureIndexes()` automatically inside `getGraph()` and reads connection
    settings from `config.ts` instead of raw env vars, so every caller gets indexes for free.
  - Ran the actual §2 demo scenario through the live daemon in `/tmp/demo-relayer`: created the Express
    memory, created the Hono memory, superseded Express, and `POST /recall` with the natural-language
    query "what framework does the relayer use" correctly returns "Relayer uses Hono" with
    `supersedes: {text: "Relayer uses Express"}` in the response — this is the exact claim the hackathon
    demo depends on, confirmed working against curl, not just planned.
  - Bug found via that same test: FalkorDB full-text search is RediSearch-backed and treats a
    multi-word query as an implicit AND/phrase — natural questions matched nothing. Fixed with a
    stop-word-stripping, OR-joining query sanitizer (`toFulltextQuery`) before every fulltext call.
  - `/projects` initially returned `{slug}` only (grabbed an arbitrary first node instead of the actual
    `:Project` node) — fixed with a direct `MATCH (p:Project) RETURN p` query.
  - Verified `/forget` actually removes a memory from `/context` output, then restored the demo project
    to its clean 3-memory state (Hono active, Express superseded, pnpm active) for future use.

- **2026-10-16 — T3 complete: MCP server built and verified with a real MCP client over stdio.**
  - Built `src/mcp/server.ts`: `McpServer` + `registerTool()` for all 5 tools (`engram_recall`,
    `engram_remember`, `engram_project_context`, `engram_forget`, `engram_explain`), each a thin wrapper
    calling the daemon's REST API. Reads `ENGRAM_CWD`/`ENGRAM_TOOL` env vars (set by the client's MCP
    config) as the primary cwd/tool-identity mechanism, falling back to `process.cwd()`. Auto-starts the
    daemon (spawning the built `.js` if present, else `npx tsx` on the `.ts` source for dev) if `/health`
    doesn't respond.
  - Verified with a disposable test harness (`Client` + `StdioClientTransport` from the SDK itself,
    simulating what Cursor/Gemini CLI would do) rather than the Inspector's browser UI: `listTools()`
    returns all 5 tools, and `engram_recall({query: "what framework does the relayer use"})` with
    `ENGRAM_TOOL=cursor` returns "Relayer uses Hono (supersedes: 'Relayer uses Express') — via
    claude-code" — confirms the full stdio MCP protocol path works, not just the HTTP layer underneath.

## Next

- T4: extraction/reconciliation — blocked on an LLM provider key (see Open questions below).
- T5: Claude Code hooks (SessionStart/Stop/SessionEnd) for automatic capture.
- T6: `engram install cursor` / `engram install gemini-cli` config writers.

## Open questions

- Which LLM provider key does Ved actually have for T4.1 (Anthropic / OpenAI / Gemini)? Needed before
  extraction/reconciliation can be built — pick one and wire Ollama for local embeddings alongside it.
- Deploy decision for T8.3 (read-only web UI against FalkorDB Cloud vs. local-only + video) — defer to
  Sunday per the plan, but flag now that FalkorDB Cloud free-tier limits weren't checked in this pass.

## Gotchas

- `falkordb` npm package: `import { FalkorDB, type Graph } from 'falkordb'` — named exports, NOT default.
- FalkorDB query rows come back as `{ alias: value, ... }` objects, not positional tuples — always name
  your RETURN aliases and destructure by name, never by array index.
- A Cypher write gated by a leading `MATCH` that finds nothing silently returns 0 rows, no error — check
  `result.data.length` when the write's success depends on that match succeeding.
- FalkorDB full-text search is RediSearch-backed: a plain multi-word search string is an implicit
  AND/phrase match. Natural-language recall queries need stop words stripped and terms OR-joined
  (`word1|word2`) before calling `db.idx.fulltext.queryNodes`, or they return nothing.

- `Memory.embedding` writes MUST use `vecf32($vec)` — a plain array silently fails to use the vector
  index (falls back to full scan with no error).
- Full-text index creation must use `CREATE FULLTEXT INDEX FOR (n:Label) ON (n.prop)`, not
  `db.idx.fulltext.createNodeIndex`, on FalkorDB 6.x.
- `@modelcontextprotocol/sdk` is mid-transition to v2 — always check the installed version's own
  `.d.ts` before trusting a blog post or older tutorial on tool registration.
- Don't build the live demo around Antigravity — no confirmed local MCP config surface.
