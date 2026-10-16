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

- **2026-10-16 — T4.1 done: Groq provider built and tested live against the real API.**
  - Ved provided a Groq API key (free tier) and asked for Kimi K2 specifically. Built `src/llm/provider.ts`
    (provider-agnostic `LlmProvider`/`EmbeddingProvider` interfaces + factory) and `src/llm/groq.ts`
    (`groq-sdk`-based implementation). Config: `LLM_PROVIDER=groq` is now the default, `GROQ_API_KEY`
    readable from either `.env`/env or `~/.engram/config.json` (`groqApiKey`) — Groq is the only
    provider with a user-supplied-key path for now, by design.
  - Added `process.loadEnvFile()` (built into Node 24, no `dotenv` dependency needed) to `config.ts`,
    called at daemon startup.
  - **Kimi K2 isn't actually available on this account**: both `moonshotai/kimi-k2-instruct-0905` and
    the undated `moonshotai/kimi-k2-instruct` 404'd with "does not exist or you do not have access to
    it." A live `GET /openai/v1/models` call confirmed the key's actual available models are
    `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, plus some audio/guard models — no
    Kimi K2. Switched the default to `openai/gpt-oss-120b`, which is actually the stronger pick anyway
    (Groq's docs confirm it's on the strict `json_schema` whitelist for guaranteed-valid JSON; Kimi K2
    would only have gotten best-effort `json_object` mode).
  - Live-tested `GroqProvider.complete()` with the exact §2 demo conversation line and got back
    correctly-classified JSON (one `decision`, one `preference`, with entities tagged) — confirms the
    provider call works end to end, though the full extract→reconcile→write pipeline (T4.4) isn't
    wired yet.
  - **Security note:** the Groq API key was pasted directly into chat. It's stored only in the
    gitignored local `.env` (confirmed not tracked by git), never committed or logged elsewhere. Ved
    should rotate it in the Groq console at his convenience since it's now in that chat's history.

- **2026-10-16 — T4.2–T4.4, T4.6 complete: the full automatic-capture pipeline works end to end.**
  - `src/memory/redact.ts` + `scripts/test-redact.ts` (13/13 passing), `src/llm/prompts.ts`
    (extraction + reconciliation prompts with zod schemas), `src/memory/extract.ts`,
    `src/memory/reconcile.ts`, `src/memory/write.ts`, all wired into `/ingest`'s queue job.
  - **Live end-to-end proof, not just unit tests:** seeded "Relayer uses Express" via `/memories`, then
    POSTed the exact §2 conversation line to `/ingest`. The daemon automatically extracted two
    memories, reconciled the Hono one against the existing Express memory, and created a real
    `SUPERSEDES` edge — Express flipped to `status: superseded` with no manual intervention. This is
    the core hackathon pitch (decisions supersede automatically, across a shared graph) working for
    real, not simulated.
  - Built `scripts/seed-demo.ts`: deterministic, no-LLM fallback that reproduces the exact §2 end-state.
    Verified it derives the project slug via the real `resolveProject()` (an earlier draft hardcoded a
    different slug, which would have seeded a graph the daemon's `cwd`-based lookup could never find —
    caught and fixed before committing).
  - Deferred: `recall.ts` as its own module (T4.5) — the logic already lives inline in
    `daemon/routes.ts` from T2 and recall already works without it; pure refactor, not new capability.
    Also deferred: `ollama.ts` embeddings — recall works via fulltext+entity-expand without them.
  - **Reliability finding:** LLM-based reconciliation is a judgment call, not deterministic — one early
    test run classified a clear supersession as `ADD` instead. Isolated repeat testing (3/3) suggests
    `gpt-oss-120b` is actually fairly consistent on this exact case, but it's not a guarantee — this is
    exactly why `seed-demo.ts` exists as a deterministic fallback for the recorded video.
  - **Security incident, resolved:** while writing `scripts/test-redact.ts`, the real Groq key (the one
    pasted in chat earlier) was used as a literal test fixture instead of a fake one. GitHub's push
    protection rejected the push before it reached the remote. Since the bad commit was local-only,
    amended it in place with fake fixtures and verified with `git log -p` that the real key no longer
    appears anywhere in history before re-pushing. No remote exposure occurred. This is a second,
    independent reason (beyond the original chat-paste) to rotate that key.

- **2026-10-16 — T5 complete: Claude Code hooks built and verified with simulated real payloads.**
  - Found the real JSONL transcript schema by reading THIS session's own transcript file directly
    (`~/.claude/projects/-Users-vedmohan-Projects-engram/<session>.jsonl`) rather than guessing or
    trusting docs that don't publish it. Built `src/transcripts/claude-code.ts` against that ground
    truth; tested on the real 1630-line file, correctly extracted 160 clean messages (dropped thinking
    blocks, tool_use blocks, tool_result feedback, and all harness bookkeeping types).
  - Built `src/hooks/claude-code.ts` (SessionStart/Stop/SessionEnd/PreCompact handlers, local offset
    file tracking at `~/.engram/offsets/`) and wired `engram hook <event>` into `src/cli.ts`.
  - Refactored `ensureDaemonRunning`/`daemonFetch` out of `mcp/server.ts` into shared
    `src/daemon/rpc.ts` (hooks need the same logic); re-ran the T3 live-MCP-client test afterward to
    confirm no regression.
  - **Verified the actual automatic-capture pitch**, not just the pieces in isolation: built a fake
    transcript file in the confirmed real schema, seeded an existing "Relayer uses Express" memory,
    then piped a simulated Stop-hook stdin payload into `engram hook stop`. It automatically produced
    `SUPERSEDE` + `ADD` with zero manual `/ingest` calls — exactly what a real Claude Code session
    would trigger.
  - Built `src/install/claude-code.ts` (`mergeEngramHooks` hook-merging, `installClaudeCodeHooks`
    file writer with backup, `installClaudeCodeMcp` shelling out to `claude mcp add`) and
    `scripts/test-install.ts` (12/12 passing) — tested entirely against a `mkdtemp` scratch directory,
    confirmed existing hooks are preserved, re-install is idempotent, and backups are written correctly.
  - **Deliberately did not run `engram install claude-code` for real** against this repo's own
    `.claude/settings.local.json` or `~/.claude/settings.json` — that would start firing hooks (and real
    Groq API calls) on every future Stop event in live sessions, including this one. That's a live
    behavior change worth flagging explicitly rather than silently activating mid-build.

## Next

- T6: `engram install cursor` / `engram install gemini-cli` config writers.
- Decide with Ved whether to actually run `engram install claude-code` now (dogfooding, per CLAUDE.md
  §6) or hold off until closer to the demo.

## Open questions

- Which LLM provider key does Ved actually have for T4.1 (Anthropic / OpenAI / Gemini)? Needed before
  extraction/reconciliation can be built — pick one and wire Ollama for local embeddings alongside it.
- Deploy decision for T8.3 (read-only web UI against FalkorDB Cloud vs. local-only + video) — defer to
  Sunday per the plan, but flag now that FalkorDB Cloud free-tier limits weren't checked in this pass.

- **2026-10-16 — near-miss: real Groq key almost got committed.** Used the user's actual key as a
  literal test fixture in `scripts/test-redact.ts` (should have used an obviously-fake placeholder of
  the same shape from the start). GitHub's push protection caught it and rejected the push before
  anything reached the remote. Since the bad commit was local-only (never pushed), amended it in place
  to swap in fake fixtures rather than leaving a real secret sitting in git history — confirmed clean
  with `git log -p` before re-pushing. No remote exposure occurred, but reinforces the standing
  recommendation to rotate the key regardless (it was still pasted in chat earlier).

## Gotchas

- `falkordb` npm package: `import { FalkorDB, type Graph } from 'falkordb'` — named exports, NOT default.
- FalkorDB query rows come back as `{ alias: value, ... }` objects, not positional tuples — always name
  your RETURN aliases and destructure by name, never by array index.
- A Cypher write gated by a leading `MATCH` that finds nothing silently returns 0 rows, no error — check
  `result.data.length` when the write's success depends on that match succeeding.
- FalkorDB full-text search is RediSearch-backed: a plain multi-word search string is an implicit
  AND/phrase match. Natural-language recall queries need stop words stripped and terms OR-joined
  (`word1|word2`) before calling `db.idx.fulltext.queryNodes`, or they return nothing.
- A model being documented on Groq's site doesn't mean a given API key has access to it — Kimi K2 is
  real and documented but 404'd on this key. Always confirm with a live `GET /openai/v1/models` call
  against the actual key in use before hardcoding a model id.
- LLM-based reconciliation (ADD/DUPLICATE/SUPERSEDE/CONTRADICT classification) is probabilistic, not
  deterministic — don't assume one successful test run means it always classifies the same input the
  same way. This is precisely why `scripts/seed-demo.ts` exists: the recorded demo video should not
  depend on a live model call succeeding.
- Any script or test fixture that needs to address "the project at path X" must derive the project slug
  via the real `resolveProject()`, not a hand-picked string — the daemon's own `cwd`-based lookup uses
  that same function, so a mismatched slug silently seeds a graph nothing will ever query.
- Never use a real secret as a test fixture, even "just for one test" — GitHub's push protection will
  catch it, but the simpler fix is to never type the real value into a fixture file in the first place.

- `Memory.embedding` writes MUST use `vecf32($vec)` — a plain array silently fails to use the vector
  index (falls back to full scan with no error).
- Full-text index creation must use `CREATE FULLTEXT INDEX FOR (n:Label) ON (n.prop)`, not
  `db.idx.fulltext.createNodeIndex`, on FalkorDB 6.x.
- `@modelcontextprotocol/sdk` is mid-transition to v2 — always check the installed version's own
  `.d.ts` before trusting a blog post or older tutorial on tool registration.
- Don't build the live demo around Antigravity — no confirmed local MCP config surface.
