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

- **2026-10-16 — T6.1/T6.2/T6.4/T6.5 complete: Cursor, Gemini CLI, Claude Desktop installers + rules snippet.**
  - Built shared `src/install/mcp-json.ts` (`mergeMcpServer`/`writeMcpConfig`, same backup-before-write
    pattern as T5.4's hooks installer) and `src/install/resolve.ts` (shared command/args resolution,
    also refactored into `install/claude-code.ts` to remove duplication).
  - `src/install/cursor.ts`, `src/install/gemini-cli.ts`, `src/install/claude-desktop.ts`,
    `src/install/rules-snippet.ts` — all wired into `engram install <client>` in `cli.ts`, with a new
    opt-in `--with-rules` flag for appending the recall/remember nudge to `AGENTS.md`/`GEMINI.md`.
  - 23/23 tests passing in `scripts/test-install.ts`. **Every test for `project` scope ran against a
    fresh `mkdtemp` scratch directory — confirmed by directly inspecting it afterward that this
    machine's real `~/.cursor/mcp.json` (which has 5 pre-existing real MCP servers: smoothsend,
    agentcash, figma, n8n-mcp, chrome-devtools) was untouched.** `user`-scope paths (`~/.cursor/...`,
    `~/.gemini/...`) were never exercised for the same reason T5.4 held back on the real Claude Code
    settings — only the pure `mergeMcpServer` function and `project`-scope file writes were tested live.
  - Found and documented a real gap rather than overclaiming: Claude Desktop's installer sets
    `ENGRAM_TOOL=claude-desktop` but NOT `ENGRAM_CWD` (no per-project workspace there), and the MCP
    server's current fallback (`process.cwd()`) means a bare "remember X" from Desktop doesn't actually
    land in `engram_global` the way the pitch implies — would need a small `mcp/server.ts` change
    (default scope to "global" when `ENGRAM_CWD` was never set) that wasn't made since Desktop is
    lower-priority than Claude Code/Cursor/Gemini CLI for the demo.
  - T6.5 (rules snippet) turned out to be more load-bearing than its "optional/nice-to-have" framing in
    PLAN.md suggested: Cursor and Gemini CLI have no hooks system, so without this nudge an agent there
    has zero automatic trigger to ever call `engram_recall`.
  - Fixed an unrelated pre-existing bug while re-running the full test suite: `scripts/smoke.ts` wasn't
    idempotent — FalkorDB persists to a docker volume, so every prior run's memories stayed in the
    `smoke-test` graph and a second run's assertions (expects exactly 2 active memories) would fail.
    Added a `graph.delete()` cleanup at the start of the script.

- **2026-10-17 — T7 complete: web UI built AND visually verified in a real browser against live data,
  not just type-checked.**
  - Built `src/web/index.html`: project picker, search/recall box, Cytoscape.js graph view, memory
    detail panel, timeline — single file, no build step, served by the daemon's new `serveStatic`
    middleware in `daemon/server.ts`.
  - **Real bug found and fixed:** `@hono/node-server`'s `serveStatic({root})` resolves the root path
    relative to `process.cwd()` eagerly (an `existsSync` check runs the moment `serveStatic()` is
    called, not per-request) — but the daemon gets auto-started from arbitrary project directories via
    hooks/MCP. Fixed with `process.chdir()` to the package's own directory, and specifically verified
    the fix by starting the daemon from `/tmp` and confirming both the static page and `cwd`-scoped API
    calls still worked.
  - Used the `claude-in-chrome` browser tool to actually load the page, take screenshots, click nodes,
    and type a search query — not just curl/type-check. This caught a real visual problem curl testing
    never could: the originally-planned `cose` (force-directed) graph layout produced overlapping node
    labels, and retuning its physics parameters three times just relocated the overlap rather than
    fixing it. Switched to `breadthfirst` (deterministic, layered, built into Cytoscape core) since this
    graph is naturally layered anyway (Tool → Session → Memory → Entity) — this eliminated the overlaps
    entirely and is reproducible across reloads, which also matters for recording a consistent demo video.
  - Confirmed end-to-end in the browser: clicking "Relayer uses Hono" loads its real `/explain` data
    including the supersession chain; typing "what framework does the relayer use" into the search box
    and pressing Enter correctly surfaces the same memory via `/recall`. Zero console errors on load.
  - Only implemented/verified the dark palette (the demo's hero shot per T7.5) — a light-mode token set
    exists in the CSS but hasn't been screenshot-checked.

- **2026-10-17 — build-system bug found and fixed while preparing T8.1's quickstart commands.**
  `npm run build` had never actually been run before (only `tsc --noEmit` throughout T0–T7) — running
  it for real surfaced two bugs the type-checker alone couldn't catch:
  1. `tsconfig.json` had `rootDir: "."` (to accommodate both `src/**` and `scripts/**`), so `tsc`
     preserved the `src/` prefix in output — `dist/src/cli.js`, not `dist/cli.js`. `package.json`'s
     `bin` field (`dist/cli.js`) was wrong from the start and would have failed for anyone who actually
     built and ran it.
  2. Worse: every self-referential path computation (`mcp/server.ts`'s daemon-path resolution,
     `daemon/server.ts`'s `process.chdir()` to the package root, `install/resolve.ts`'s MCP command
     resolution) assumes a specific nesting depth relative to its own file. The extra `src/` level in
     the built output would have silently resolved these one directory too shallow.
  Fixed by setting `rootDir: "./src"` and dropping `scripts/**` from the main `tsconfig.json`'s
  `include` (scripts are dev-only, always run via `tsx`, never need building) — added
  `tsconfig.scripts.json` (extends the base config, `rootDir: "."`, includes both `src/` and `scripts/`)
  so `scripts/*.ts` still gets type-checked via a new `npm run typecheck` script.
  **Verified the fix by actually running the built artifacts, not just re-running `tsc --noEmit`:**
  `node dist/cli.js up` from `/tmp` correctly served both the static UI and the API; with no daemon
  running, the built MCP server (`dist/mcp/server.js`) correctly auto-detected that and spawned the
  built daemon (`dist/daemon/server.js`), which then answered the real recall query correctly.
  This is exactly the kind of thing a hackathon judge running the README's own quickstart would have
  hit immediately — worth the extra verification pass.

- **2026-10-17 — T8.1 (README) done: every quickstart command actually run, not just written.**
  - Wrote `README.md`: problem statement, "why a graph" (supersession/provenance/graph-expansion/
    multigraph), quick start, architecture diagram, client support table, privacy section, hackathon
    track, status pointing at this file and `PLAN.md`.
  - Tested `node dist/cli.js up` and `node dist/cli.js install cursor/gemini-cli --scope project` for
    real, both from throwaway directories — confirmed correct generated JSON referencing the actual
    built `dist/mcp/server.js` path. `install claude-code` was NOT run for real (same held boundary as
    T5.4: its MCP half shells out to the real `claude mcp add`, which mutates the real `~/.claude.json`
    regardless of invocation directory).
  - Captured a real screenshot of the live web UI via the `claude-in-chrome` browser tool
    (`docs/web-ui.jpg`) and embedded it in the README instead of a placeholder GIF — genuine proof the
    system works, pending a proper recorded demo video (T8.2, which needs Ved).

- **2026-10-17 — T8.4 (BLOG.md) done.** Grounded entirely in this file's real history rather than
  generic hackathon copy: the daily multi-tool pain, why vector-only memory can't represent
  supersession, the three places graph structure concretely helped, and the three real bugs found
  during the build (keyed-not-positional query rows, RediSearch's implicit AND on full-text queries,
  Kimi K2 documented-but-unavailable on the key in use).

- **2026-10-17 — web UI restyled with Mistral AI's actual brand system, at Ved's explicit request.**
  - Ved asked to apply `npx getdesign@latest add mistral.ai`. Verified `getdesign` first (npm registry:
    real, 5-day-old, MIT, zero dependencies, "CLI for installing DESIGN.md templates into projects") and
    its homepage before running it, since running an unfamiliar package via `npx` executes its code —
    confirmed it only writes a `DESIGN.md` reference file, no other side effects.
  - The resulting `DESIGN.md` is Mistral's real marketing-site brand book: warm cream/orange "sunset"
    palette, PP Editorial Old (near-serif display) + Inter (UI) + JetBrains Mono (code), 8px button /
    12px card radii, explicitly **no documented dark mode** and explicit guidance against adding extra
    accent colors beyond orange/yellow/cream.
  - Asked Ved to disambiguate two real decisions before building: what "a link to show" actually meant
    (static showcase vs. real deployment — he wants an SDK-doc-style page with an install guide,
    building now), and whether Mistral's style should apply only to a showcase page or to the real web
    UI too (he said both/the real UI too) — this explicitly overrides T7.5's original dark-mode-only
    framing, which is now documented as superseded rather than silently dropped.
  - Restyled `src/web/index.html` end to end: swapped all CSS custom properties to Mistral's tokens,
    IBM Plex Sans/Mono → Inter/JetBrains Mono, Fraunces → Newsreader (closer to "PP Editorial Old"'s
    classical character), removed the `prefers-color-scheme: dark` block entirely (no source to draw a
    dark palette from), remapped graph-node/badge colors to stay within the brand's stated palette —
    orange reserved exclusively for "active" status (directly matching the brand's own "reserve primary
    orange for primary CTAs and active states only" rule), entities/structural nodes distinguished by
    cream/neutral fill and dashed-vs-solid borders rather than inventing new hues. Found and removed one
    piece of dead code (`nodeColorByLabel`, defined but never called) while doing the sweep.
  - Re-verified visually via the `claude-in-chrome` browser tool (not just that it compiles): graph
    view, the `SUPERSEDES` edge (now orange), badges, and the detail panel with its supersession chain
    all render correctly in the new palette. Replaced `docs/web-ui.jpg` with a fresh screenshot.

- **2026-10-17 — built the "link to show": a Claude Artifact installation/overview page.**
  Published at https://claude.ai/artifact/7YnddkuAn1PFAz56MHMD6k (private by default — Ved shares it
  from the page's share menu when ready). Same Mistral design tokens as the real UI for visual
  consistency: hero with the one-line pitch and a copy-able one-line install command, the real
  restyled-UI screenshot embedded (not a mockup), three value-prop cards condensed from the README,
  a 6-step installation guide with dark code blocks and per-step copy buttons, the `seed-demo`
  no-LLM fallback, and the brand's actual "sunset stripe" signature gradient band at the foot of the
  page (DESIGN.md calls this out as the single most load-bearing brand element — "don't drop it from
  any page"). Verified by actually loading the published page and scrolling through it, not just
  publishing and assuming — confirmed the embedded screenshot loads, code blocks render correctly, and
  the sunset stripe shows at the bottom.
  Not added to `README.md`: the artifact is private by default, so linking it publicly before Ved
  chooses to share it would be presumptuous — he can add the link himself once (if) he shares it.

- **2026-10-17 — built `site/`: a real, Vercel-deployable Next.js app for the "link to show."**
  Ved clarified he didn't want the Claude Artifact — he wants an actual Next.js app he can deploy to
  Vercel himself. Scaffolded with `create-next-app` (TypeScript, App Router, no Tailwind — hand-written
  CSS instead, to stay minimal) at `site/`, nested inside this repo (its own `package.json`/
  `node_modules`/`.gitignore`, doesn't touch the main project's dependencies).
  - Ported the same content/design as the Artifact version (hero, real screenshot, 3 value-prop cards,
    6-step install guide with copy buttons, `seed-demo` fallback, the brand's sunset-stripe signature
    element) into proper React components: `app/page.tsx` (server component), `app/CodeBlock.tsx`
    (server), `app/CopyButton.tsx` (`'use client'`, the only interactive piece — clipboard access
    needs a client component). Fonts via `next/font/google` (Newsreader/Inter/JetBrains Mono, same as
    the real UI and `DESIGN.md`).
  - **Real bug found and fixed, not just `tsc`-level:** `next build` warned that Turbopack mis-detected
    the workspace root because the parent `engram` repo has its own `package-lock.json` one level up
    from `site/`'s. Fixed with an explicit `turbopack.root` in `next.config.ts` — matters doubly here
    since Vercel builds from a clean checkout, where an inferred-wrong root could misresolve files in
    ways that wouldn't necessarily surface locally the same way.
  - **Verified the actual production build, not just dev mode:** `npm run build` (clean, no warnings
    after the turbopack fix) → `npm run start` → loaded in a real browser (port 3001, since FalkorDB's
    own Browser UI already owns :3000 via `docker-compose.yml` — did not touch that). Confirmed: zero
    console errors, the embedded screenshot loads via `next/image`, and the copy-to-clipboard button
    actually works (showed "Copied" feedback on click).
  - `npm install` reported 5 high-severity advisories, all in the `eslint-config-next` → `braces` dev
    dependency chain (glob-matching, lint-time only, never shipped in the production bundle) — left
    as-is rather than force-downgrading `eslint-config-next` for a non-issue.
  - Wrote `site/README.md` with the actual deploy steps (Vercel "Root Directory" = `site`, since this
    is a monorepo subdirectory, not its own repo — the one setting that isn't auto-detected).
  - Did NOT commit the original Claude Artifact as a replacement for this — both now exist; the
    Artifact is still live at the URL shared earlier if useful as a private preview, but `site/` is
    the one Ved can actually deploy under his own domain.

- **2026-10-17 — deployed `site/` to Vercel via the CLI, live now.**
  Confirmed `vercel` CLI already installed (Homebrew, v50.9.6) and already authenticated as `ivedmohan`
  — no login step needed. `cd site && vercel --prod --yes` linked a new project
  (`ved-mohans-projects-486ed2df/site`) and deployed non-interactively. Live at
  **https://site-sigma-six-73.vercel.app** (also aliased at the longer
  `site-bt5r1apso-ved-mohans-projects-486ed2df.vercel.app` deployment URL). Verified the actual
  production deployment in a real browser, not just a 200 status check: screenshot loads, fonts render,
  zero console errors — same as the local verification.

## Next

- **Every autonomously-doable item in T0–T8 is now done.** What's left all genuinely needs Ved:
  - T8.2 (demo video) — recording/narrating isn't something I can do.
  - T8.3 (deploy decision) — a judgment call, possibly needs a FalkorDB Cloud account.
  - T8.5 (submit) — requires his actual hackathon-platform account.
  - Whether to run `engram install claude-code` for real now (dogfooding, per CLAUDE.md §6) or hold off
    until closer to the demo — open since T5, still unresolved, his call.
- T9 (stretch) is explicitly "only after all MUST tasks" — all MUST tasks (T0–T8.1/T8.4) that don't
  require Ved are done, so T9 could start, but T8.2/T8.3/T8.5 still block an actual submission.

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
