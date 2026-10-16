# PLAN.md — Engram build plan

Working name: **Engram** (rename anytime: package name, CLI name, graph prefix, README).
Hackathon: Graph Hacks: Context for AI Agents (WeMakeDevs × FalkorDB), **deadline 18 Oct 2026, 11:59 PM IST.**

Legend: `[ ]` todo · `[x]` done · **MUST** = needed for submission · *STRETCH* = only after all MUST are done
`RESEARCH:` = verify against official docs before coding (APIs drift; don't trust memory).

---

## 1. The problem and the pitch

Developers use several AI tools a day: Claude Code, Cursor, Antigravity, Gemini, Grok, Claude.ai.
Every one of them starts from zero. Decisions made in one tool are invisible in another, and worse,
memory tools that *do* exist hand agents **stale** context, such as a decision that was already reversed.

**Engram** is a local-first memory layer. Every AI tool on your machine reads and writes one
**memory graph** in FalkorDB, running on your own machine. Because memory is a graph:

1. **It knows what's outdated.** New decisions `SUPERSEDE` old ones; agents only get what's current.
2. **Provenance.** Every memory records which tool and session it came from and when.
3. **Scoped recall.** Opening a repo pulls memories connected to that project and the entities it touches.
4. **Isolation.** One graph per project plus a global graph for personal preferences (FalkorDB multigraph).
5. **Private.** Nothing leaves the machine except optional LLM calls, and secrets are redacted first.
6. **Zero effort.** Hooks capture sessions automatically; the user doesn't have to say "remember this".

## 2. The demo flow (everything serves this)

1. In Claude Code, inside repo `demo-relayer`: "Let's switch the relayer from Express to Hono, and
   we always use pnpm in this repo." End the session.
2. Engram's Stop/SessionEnd hook captures the transcript, extracts two memories, and marks the old
   "relayer uses Express" memory as superseded.
3. Open **Cursor** in the same repo and ask "what framework is the relayer on and how do I install deps?"
   Cursor calls Engram over MCP and answers "Hono, via pnpm", citing that this was decided in
   Claude Code on <date> and that it replaced Express.
4. Open **Gemini CLI** and the same answer comes back. (Antigravity has no confirmed local-MCP story — see T6.3 — don't build the demo around it.)
5. Open the Engram web UI: a graph shows Project → Memories → Entities, with the `SUPERSEDES` edge
   highlighted and a timeline per tool. Click a memory to see its full provenance path.
6. (Stretch) In the Gemini web app, click the extension's "Add Engram context" button.

Seed script `scripts/seed-demo.ts` must be able to reproduce this state from scratch, so the demo is
recordable even if live extraction misbehaves.

## 3. Graph model

### 3.1 Graphs (FalkorDB multigraph)

- `engram_global`: user-level memories (preferences, style, tools, people). Applies everywhere.
- `engram_p_<projectSlug>`: one graph per project. `projectSlug` is derived from the **git repo root**
  (folder name + short hash of the absolute path, so two repos named `api` don't collide).
  Not in a git repo → use `cwd` the same way.
- Recall queries both the project graph and `engram_global`, then merges and ranks the results in code.

### 3.2 Nodes

| Label | Key properties |
|---|---|
| `Project` | `id`, `slug`, `name`, `root` (abs path), `gitRemote?`, `createdAt` |
| `Tool` | `name` (`claude-code` \| `cursor` \| `antigravity` \| `gemini-cli` \| `claude-desktop` \| `browser:gemini` …) |
| `Session` | `id`, `tool`, `externalId?` (e.g. Claude Code session_id), `cwd`, `startedAt`, `endedAt?`, `processedOffset` |
| `Memory` | `id`, `text`, `kind` (`fact` \| `decision` \| `preference` \| `task` \| `context`), `status` (`active` \| `superseded` \| `forgotten`), `confidence` (0–1), `createdAt`, `validFrom`, `validTo?`, `embedding` (vecf32), `hash` |
| `Entity` | `id`, `name` (normalised, lowercase), `display`, `type` (`file` \| `library` \| `service` \| `person` \| `concept` \| `command` \| `env`) |

### 3.3 Edges

```
(:Tool)-[:RAN]->(:Session)
(:Session)-[:IN_PROJECT]->(:Project)
(:Session)-[:CAPTURED]->(:Memory)
(:Memory)-[:ABOUT]->(:Entity)
(:Memory)-[:SUPERSEDES {at, reason}]->(:Memory)      // new -> old
(:Memory)-[:CONTRADICTS {at}]->(:Memory)             // flagged, unresolved
(:Entity)-[:RELATED_TO {weight}]->(:Entity)          // co-occurrence, incremented on write
```

### 3.4 Indexes — VERIFIED 2026-10-16 against docs.falkordb.com

- Range index: `CREATE INDEX FOR (m:Memory) ON (m.status)` (same form for `Memory.id`, `Entity.name`, `Session.id`).
- Full-text index: use the **DDL form**, not the procedure form —
  `CREATE FULLTEXT INDEX FOR (m:Memory) ON (m.text)`. On FalkorDB 6.x the procedure form
  (`db.idx.fulltext.createNodeIndex`) was narrowed to a single-label-arg call and errors on
  multi-property use; the DDL form is portable across 4.x/6.x.
  Query: `CALL db.idx.fulltext.queryNodes('Memory', 'search term') YIELD node, score`.
- Vector index on `Memory.embedding`, dimension from config (768 for `nomic-embed-text`,
  1536 for `text-embedding-3-small`), cosine similarity. Confirmed syntax:
  `CREATE VECTOR INDEX FOR (m:Memory) ON (m.embedding) OPTIONS {dimension: 768, similarityFunction: 'cosine'}`
  (dimension 1–4096; optional HNSW params `M`, `efConstruction`, `efRuntime`).
  Query: `CALL db.idx.vector.queryNodes('Memory','embedding', $k, vecf32($vec)) YIELD node, score`.
  **Gotcha (write-side, not just query-side):** `Memory.embedding` MUST be written wrapped as
  `vecf32($vec)` — e.g. `SET m.embedding = vecf32($vec)` — never a plain array. A plain array looks
  identical at a glance but the native ANN index silently can't use it and `queryNodes` falls back to
  a full scan. Verify with `typeof(m.embedding)` if recall ever feels slow.
- Range + fulltext + vector indexes on different properties of the same label coexist fine (no
  documented restriction; they're on different properties anyway).

## 4. Repo layout

```
engram/
├─ CLAUDE.md  PLAN.md  PROGRESS.md  README.md  BLOG.md
├─ docker-compose.yml
├─ package.json  tsconfig.json  .env.example
├─ src/
│  ├─ config.ts              # load ~/.engram/config.json + env
│  ├─ project.ts             # cwd -> git root -> projectSlug
│  ├─ graph/
│  │  ├─ client.ts           # FalkorDB connection, selectGraph(slug)
│  │  ├─ schema.ts           # ensureIndexes(graph)
│  │  └─ queries.ts          # ALL Cypher, named + parameterised
│  ├─ llm/
│  │  ├─ provider.ts         # interface: complete(json), embed(texts)
│  │  ├─ anthropic.ts  openai.ts  gemini.ts  ollama.ts
│  │  └─ prompts.ts          # extraction + reconciliation prompts
│  ├─ memory/
│  │  ├─ redact.ts           # secret scrubbing
│  │  ├─ extract.ts          # transcript -> candidate memories
│  │  ├─ reconcile.ts        # candidate vs existing -> ADD/SUPERSEDE/DUP/CONTRADICT
│  │  ├─ write.ts            # graph writes
│  │  └─ recall.ts           # hybrid retrieval + graph expansion + ranking
│  ├─ daemon/
│  │  ├─ server.ts           # Hono app, 127.0.0.1:7777
│  │  ├─ routes.ts           # REST API (§5)
│  │  └─ queue.ts            # in-process job queue for extraction
│  ├─ mcp/server.ts          # stdio MCP server -> daemon HTTP
│  ├─ hooks/claude-code.ts   # session-start / stop / session-end handlers
│  ├─ transcripts/claude-code.ts  # parse Claude Code JSONL transcripts
│  ├─ cli.ts                 # `engram` bin
│  └─ web/                   # index.html, app.js, styles.css (served statically)
├─ scripts/seed-demo.ts  scripts/smoke.ts
└─ extension/                # STRETCH: Chrome MV3 extension
```

## 5. Daemon REST API (127.0.0.1:7777, JSON)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | daemon + FalkorDB status |
| POST | `/sessions` | upsert a session `{tool, externalId, cwd}` → `{sessionId, projectSlug}` |
| POST | `/ingest` | `{sessionId, tool, cwd, messages:[{role,text,ts}]}`, enqueues extraction |
| POST | `/memories` | explicit remember `{text, kind?, cwd, tool, scope:'project'\|'global'}` |
| POST | `/recall` | `{query, cwd, limit?, includeSuperseded?}` → ranked memories with provenance |
| GET | `/context?cwd=` | compact markdown block for session start (top N active memories) |
| POST | `/forget` | `{memoryId}` or `{query, cwd}` → marks `forgotten` |
| GET | `/timeline?cwd=` | memories by time, grouped by tool |
| GET | `/explain/:memoryId` | provenance path + supersession chain |
| GET | `/graph?cwd=` | nodes and edges for the web UI |
| GET | `/projects` | known projects |

## 6. Pipelines

### 6.1 Write path (ingest)

1. **Redact** secrets (T4.2).
2. **Chunk** new messages since `Session.processedOffset` (so the Stop hook can fire many times cheaply).
3. **Extract** (LLM, JSON mode): returns `[{text, kind, scope, entities:[{name,type}], confidence}]`.
   Prompt rules: only durable, reusable facts and decisions; one atomic fact per memory; present tense;
   skip chit-chat, transient errors and anything already obvious from code; scope `global` only for
   user preferences.
4. **Embed** each candidate.
5. **Reconcile** each candidate: fetch the top-k similar active memories (vector) plus memories sharing
   entities, then ask the LLM to classify as `ADD` | `DUPLICATE(id)` | `SUPERSEDE(id, reason)` | `CONTRADICT(id)`.
6. **Write** in one query per memory: create the Memory, link it to Session/Entities, create the
   `SUPERSEDES` edge and set the old memory to `status='superseded', validTo=now`, and bump
   `RELATED_TO` weights between co-mentioned entities.
7. Skip cheaply: hash exact duplicates (`Memory.hash`) before calling the LLM.

### 6.2 Read path (recall)

1. Resolve `cwd` → project graph plus `engram_global`.
2. Candidates come from three sources: vector top-k, full-text hits, and entity match (extract entity
   names from the query by simple matching against known `Entity.name`, with no LLM call needed).
3. **Graph expansion:** from matched entities, follow `ABOUT` / `RELATED_TO` 1–2 hops to pull connected
   active memories. This is the "graph actually matters" step, so highlight it in the README.
4. Filter `status='active'` (unless `includeSuperseded`).
5. Rank: `0.5*similarity + 0.2*graphProximity + 0.2*recency + 0.1*kindWeight` (decision > preference > fact).
6. Return each memory with provenance: `{text, kind, tool, sessionStartedAt, supersedes?:{text,at}, path:[…]}`.

## 7. Tasks

### T0. Setup (MUST) — target: Fri 16 Oct evening
- [x] T0.1 `git init`, `package.json` (type module, bin `engram` → `dist/cli.js`), `tsconfig.json`, `.gitignore`, `.env.example`. Pushed to github.com/ivedmohan/engram.
- [x] T0.2 `docker-compose.yml` with `falkordb/falkordb:latest`, ports 6379 and 3000, and a named volume for persistence. Confirmed running (FalkorDB 4.22.1).
- [x] T0.3 Install deps: `falkordb`, `@modelcontextprotocol/sdk`, `zod`, `hono`, `@hono/node-server`, `ulid`; dev: `typescript`, `tsx`, `@types/node`.
- [x] T0.4 Create `PROGRESS.md` with sections: Done, Next, Open questions, Gotchas.
- **Done when:** `docker compose up -d` works and a 5-line script connects and runs `RETURN 1`. ✅ 2026-10-16.

### T1. Graph layer (MUST) — ✅ done 2026-10-16, `scripts/smoke.ts` passing against live FalkorDB
- [x] T1.1 `graph/client.ts`: connect once, `getGraph(slug)` cache.
  **Correction found while building:** `FalkorDB` and `Graph` are **named exports** from the `falkordb`
  package (`import { FalkorDB, type Graph } from 'falkordb'`), NOT a default export — the package's own
  `.d.ts` re-exports the class under a named binding even though the submodule itself uses `export
  default`. A default import silently binds the whole CJS module object instead and fails at runtime
  with `FalkorDB.connect is not a function`. `FalkorDB.connect({username, password, socket:{host,port}})`,
  then `db.selectGraph('name')` (auto-creates the graph if missing). Query: `graph.query(cypher,
  {params:{...}})`.
- [x] T1.2 `project.ts`: find the git root, slugify + hash, read `git remote get-url origin` if present. Verified both inside a repo and in a non-repo cwd.
- [x] T1.3 `graph/schema.ts`: `ensureIndexes()`, idempotent.
  **Even better than planned:** the client ships typed helper methods —
  `createNodeRangeIndex(label, ...props)`, `createNodeFulltextIndex(label, ...props)`,
  `createNodeVectorIndex(label, dim, similarityFunction, ...props)` — so no hand-written DDL strings are
  needed at all; they generate the exact DDL from §3.4 internally. Default `similarityFunction` is
  `'euclidean'` — must pass `'cosine'` explicitly.
- [x] T1.4 `graph/queries.ts`: upsertProject, upsertTool+upsertSession (combined), createMemory (+ABOUT
  edges), supersede, contradict, forgetMemory, findMemoryByHash, listActiveMemories, vectorSearch,
  fulltextSearch, entityExpand, timeline, explainMemory, graphDump.
  **Critical runtime gotcha found (not documented anywhere, found by debugging a silent failure):**
  FalkorDB result rows are **objects keyed by RETURN alias**, e.g. `RETURN m, score` comes back as
  `{ m: {...}, score: ... }` — NOT a positional array/tuple `[m, score]`. Code written assuming
  positional tuples runs with no error but silently returns nothing useful. Always alias unaliased
  expressions (`t.name AS tool`) and destructure by name.
  Also confirmed: a query whose leading `MATCH` finds nothing returns zero rows with **no error** — don't
  assume a Cypher call "succeeded" just because it didn't throw; check `result.data.length` when a write
  depends on a preceding match (e.g. `createMemory`'s `MATCH (s:Session {id: $sessionId})`).
  Remember: wrap every embedding write in `vecf32($vec)` (see §3.4 gotcha), not just in vectorSearch.
- **Done when:** `scripts/smoke.ts` creates a project, 3 memories, one supersession, and reads them all back. ✅ — also exercises `explainMemory`'s full supersession chain.

### T2. Daemon (MUST) — ✅ done 2026-10-16, every §5 endpoint verified live against FalkorDB
- [x] T2.1 `config.ts`: `~/.engram/config.json` (port, provider, models, embedding dim), env overrides (env wins).
- [x] T2.2 `daemon/server.ts` + `routes.ts`: all of §5 implemented (`/health`, `/sessions`, `/ingest`,
  `/memories`, `/memories/supersede`, `/recall`, `/context`, `/forget`, `/timeline`, `/explain/:id`,
  `/graph`, `/projects`), bound to 127.0.0.1 only via `@hono/node-server`'s `serve({fetch, port, hostname})`.
  `/ingest` is accepted and queued but the actual extraction (T4) just logs — no LLM key configured yet.
  **Bug found and fixed by actually curling it:** FalkorDB's full-text index is RediSearch-backed — a
  plain multi-word string is parsed as an implicit AND/phrase match, so a natural-language recall query
  (e.g. "what framework does the relayer use") matched nothing even though "relayer" alone matched fine.
  Fixed with `util.ts#toFulltextQuery`: strip stop words, OR-join the remaining terms
  (`relayer|framework`) — RediSearch OR syntax. After the fix, that exact query returns "Relayer uses
  Hono" first, with the supersession-over-Express cited — this is the §2 demo's hero claim, confirmed
  working end to end via curl, not just planned.
- [x] T2.3 `daemon/queue.ts`: in-memory FIFO, concurrency 2, retry once, logs and drops after that.
- [x] T2.4 `engram up` / `engram status` CLI commands (`src/cli.ts`), PID file at `~/.engram/daemon.pid`.
  (Client auto-start-daemon-on-health-fail is deferred to T3/T5 — not needed for the daemon itself.)
- **Done when:** `curl` can remember, recall, and get context for a cwd. ✅ — also forget, timeline,
  explain, graph, and projects all verified via curl against a live `demo-relayer` test project.

### T3. MCP server (MUST)
- [ ] T3.1 `mcp/server.ts` over stdio. VERIFIED (pin `@modelcontextprotocol/sdk` to a 1.x version, e.g. 1.32.1 — v2 exists on GitHub main but isn't the npm default yet, and will likely rename things again):
  `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`, `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'`.
  Register tools with `server.registerTool(name, { description, inputSchema }, handler)` — NOT the older `server.tool(...)` form, which is superseded. `inputSchema` takes a plain ZodRawShape (no need to wrap in `z.object()`).
  Handler returns `{ content: [{ type: 'text', text: '...' }] }`. Connect with `await server.connect(new StdioServerTransport())`.
- [ ] T3.2 Tools (good descriptions matter — they're how agents decide to call them):
  - `engram_recall(query, limit?)`: "Search the user's shared memory across all their AI tools for facts and decisions about the current project. Call this before answering questions about project conventions, past decisions, architecture, or user preferences."
  - `engram_remember(text, kind?, scope?)`: "Save a durable fact, decision or preference so other AI tools can see it."
  - `engram_project_context()`: compact summary of current active memories for this repo.
  - `engram_forget(memoryId | query)`
  - `engram_explain(memoryId)`: provenance + supersession chain.
- [ ] T3.3 The MCP server uses `process.cwd()` (the client launches it in the project), with an `ENGRAM_CWD` env override. VERIFIED: MCP "roots" are **deprecated** as of the newest spec (2026-07-28) — official guidance is to use tool params/config/env vars instead, so treat `ENGRAM_CWD` / an explicit `cwd` in the client's MCP config as the **primary** mechanism, not a fallback. Cursor and Gemini CLI both support passing `cwd`/`env` per-server; Claude Desktop has no workspace concept at all (see T6.4) — treat Desktop sessions as `engram_global`-scope only.
- [ ] T3.4 Tool identity: `ENGRAM_TOOL` env var set by each client's config (e.g. `cursor`), so provenance is correct.
- **Done when:** MCP Inspector (`npx @modelcontextprotocol/inspector`) lists and runs all tools.

### T4. Extraction + reconciliation (MUST) — target: Sat 17 Oct
- [ ] T4.1 `llm/provider.ts` interface + at least ONE working API provider + `ollama.ts` for embeddings. Pick whichever key Ved has; make the JSON output robust (strip code fences, validate with zod, retry once).
- [ ] T4.2 `memory/redact.ts`: regexes for common key formats (`sk-`, `sk-ant-`, `AIza`, `ghp_`, `xox[bp]-`, AWS `AKIA`, JWTs, PEM blocks, 0x-prefixed 64-hex private keys, 12/24-word mnemonics, `KEY=value` lines in env-like text). Unit-test it.
- [ ] T4.3 `prompts.ts`: extraction prompt + reconciliation prompt (§6.1). Include 3–4 few-shot examples, including a supersede example (Express → Hono).
- [ ] T4.4 `extract.ts` → `reconcile.ts` → `write.ts` wired into the queue.
- [ ] T4.5 `recall.ts` implementing §6.2.
- [ ] T4.6 `scripts/seed-demo.ts`: reproduces the §2 demo state without LLM calls (use fixed embeddings or call embed only).
- **Done when:** feeding the §2 conversation text to `/ingest` produces the right memories and a SUPERSEDES edge, and `/recall` for "relayer framework" returns Hono first with provenance.

### T5. Claude Code integration (MUST) — automatic capture
- [ ] T5.1 VERIFIED (code.claude.com/docs/en/hooks): all five events exist exactly as assumed, plus a larger set
  (`PreToolUse`, `PostToolUse`, `SubagentStart/Stop`, `ConfigChange`, `WorktreeCreate/Remove`, …) not needed here.
  `settings.json` shape: `{"hooks": {"<EventName>": [{"matcher": "...", "hooks": [{"type": "command", "command": "...", "timeout": 600}]}]}}`.
  Stdin carries `session_id`, `cwd`, `hook_event_name`, `transcript_path`, `permission_mode`, and more.
  **Note:** `transcript_path` is written asynchronously and can lag — for `Stop`, prefer the newer
  `last_assistant_message` stdin field over re-parsing the transcript tail for the latest turn (the
  transcript parser in T5.2 is still needed for full history, just not for "what did the assistant just say").
  `SessionEnd` also carries a `why` field (`clear|resume|logout|prompt_input_exit|other`) — worth capturing for provenance.
  Context injection: `SessionStart` — plain stdout works. `UserPromptSubmit` — plain stdout only works if it
  does NOT parse as JSON, so use the explicit `{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}`
  shape for reliability. Cap is 10,000 chars per field (well above the ~1,500 token budget planned).
- [ ] T5.2 `transcripts/claude-code.ts`: parse the JSONL transcript into `{role, text, ts}`, dropping tool-call noise (keep short tool summaries if useful).
- [ ] T5.3 `hooks/claude-code.ts` + CLI `engram hook <event>`:
  - `SessionStart`: print `/context` markdown (≤ ~1,500 tokens).
  - `Stop`: use `last_assistant_message` (not the transcript tail) for the latest turn; send new messages since the last offset to `/ingest`. Must be fast and must never block or fail the session (always exit 0, with a short timeout). Default hook timeout is 600s, but exit code 2 does block `Stop` — stick to exit 0 always.
  - `SessionEnd` / `PreCompact`: final flush. **`SessionEnd` only gets a ~1.5s combined budget by default** (raisable to 60s via explicit `timeout`, but keep this hook's body trivial/fire-and-forget to the daemon regardless — don't wait on extraction synchronously). Exit code 2 can't block `SessionEnd` anyway (observational only).
  - *STRETCH* `UserPromptSubmit`: recall against the prompt and inject the top 3 if score > threshold. Default timeout here is only 30s.
- [ ] T5.4 `engram install claude-code [--scope user|project]`: VERIFIED — `claude mcp add --scope local|project|user <name> -- <command> [args...]` registers the MCP server (`local` = default/personal per-project in `~/.claude.json`, `project` = shared via `.mcp.json` in repo root, `user` = all projects via `~/.claude.json`). Still merge hooks into `settings.json` by hand (no CLI for that) without clobbering existing hooks; back up the file first.
- **Done when:** a real Claude Code session in a test repo produces memories with no manual action, and a new session starts with them in context.

### T6. Other clients (MUST: Cursor + Gemini CLI; Claude Desktop nice-to-have; Antigravity demoted — see below)
- [ ] T6.1 `engram install cursor`: VERIFIED — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global; project overrides global for same server name). Shape: `{"mcpServers":{"name":{"command":"node","args":["..."],"env":{"ENGRAM_TOOL":"cursor","ENGRAM_CWD":"..."}}}}`. Env vars per-server confirmed supported. Rules: Cursor loads both `AGENTS.md` and `.cursor/rules/*.mdc` — either works for T6.5.
- [ ] T6.2 `engram install gemini-cli`: VERIFIED — `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project), merged across System/Workspace/User levels, under `mcpServers`. Shape includes `command`, `args`, `env`, **`cwd`**, `timeout`, `trust`. If `cwd` is omitted the server inherits the CLI's invocation cwd, so the `process.cwd()`-first design in T3.3 holds here too. Rules file is `GEMINI.md` (not `AGENTS.md`).
- [ ] T6.3 Antigravity: **DEMOTED to stretch, do not plan the demo around it.** RESEARCH confirmed it's a real, current Google IDE with MCP support, but only UI-driven ("MCP Store") remote/cloud connectors (Workspace, BigQuery, AlloyDB) are documented — no public config file path or JSON shape for a custom local stdio server was found. Treat as unresolved; only attempt if time remains and you can test it directly.
- [ ] T6.4 `engram install claude-desktop`: VERIFIED — `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, same `{"mcpServers":{"name":{"command":...,"args":[...],"env":{...}}}}` shape. **No `cwd`/workspace concept** — Desktop has no per-project workspace the way an IDE does, so install this as `engram_global`-scope only (personal preferences), not part of the repo-scoped demo flow. This matches its existing "nice-to-have" priority.
- [ ] T6.5 Optional rules snippet for clients without hooks (Cursor rules / GEMINI.md / AGENTS.md): "At the start of a task call `engram_recall`; when a decision is made, call `engram_remember`." `engram install` can offer to append it.
- **Done when:** the §2 demo steps 3–4 work live with Cursor + Gemini CLI (swap "Gemini CLI (or Antigravity)" in §2 step 4 to just "Gemini CLI").

### T7. Web UI (MUST) — target: Sun 18 Oct morning
- [ ] T7.1 `src/web/index.html` served at `/`: project picker, search box, graph view, timeline.
- [ ] T7.2 Graph view from `/graph`: colour nodes by label and edges by type; show superseded memories greyed out with the `SUPERSEDES` edge highlighted.
- [ ] T7.3 Memory detail panel from `/explain/:id`: text, tool, session time, entities, and the supersession chain.
- [ ] T7.4 Timeline grouped by tool (Claude Code / Cursor / Gemini …).
- [ ] T7.5 Must look good in dark mode — this is the demo video's hero shot.

### T8. Ship (MUST) — Sun 18 Oct, finish by ~9 PM IST
- [ ] T8.1 README: problem, 30-second GIF, the "why a graph" section (supersession, provenance, graph expansion, multigraph isolation), quick start (`docker compose up -d && npx engram up && npx engram install claude-code`), architecture diagram, privacy section, and the hackathon track.
- [ ] T8.2 Demo video (2–3 min) following §2 exactly. Use `seed-demo.ts` as a fallback.
- [ ] T8.3 Deployment: since this is local-first, deploy a **read-only demo** of the web UI against FalkorDB Cloud with the seeded graph (app.falkordb.cloud), OR clearly document local setup and rely on the video. Decide by Sun noon.
- [ ] T8.4 `BLOG.md` (side prize: best blog post): the daily pain, why vector memory isn't enough, the graph model, supersession, and lessons learned.
- [ ] T8.5 Submit on WeMakeDevs **before 11:59 PM IST, 18 Oct**. Re-read the rules page first.

### T9. Stretch (only after all MUST tasks)
- [ ] *T9.1* Chrome MV3 extension, target **claude.ai first** (easiest to test against; gemini.google.com has
  no third-party connector mechanism at all, and chatgpt.com/claude.ai both confirmed to require a
  *public* HTTPS endpoint for native "custom connectors" — blocked for a local-first tool, so this has
  to be a scraping extension, not a native MCP connector, on any of the three).
  VERIFIED architecture: content script scrapes the visible conversation and relays via
  `chrome.runtime.sendMessage` to the **background service worker**, which does the actual
  `fetch('http://127.0.0.1:7777/ingest', ...)`. Do NOT fetch directly from the content script — it runs
  in the page's context and is subject to that site's CSP `connect-src`, which can silently block the
  request regardless of server headers. A background worker with `host_permissions` for
  `http://127.0.0.1:7777/*` declared in the manifest is not bound by the page's CORS/CSP, so **no
  server-side CORS config is strictly required** (adding `Access-Control-Allow-Origin:
  chrome-extension://<id>` is optional defense-in-depth, not a requirement). Tool identity: ingest with
  `tool: 'browser:claude.ai'`. Also needs an "Add Engram context" button that inserts `/context`
  markdown into the input box.
- [ ] *T9.2* `CONTRADICTS` surfacing: the UI and recall output warn "Cursor said X, Claude Code said Y — unresolved."
- [ ] *T9.3* PageRank / centrality on `Entity` to show "core concepts of this project" (uses FalkorDB graph algorithms; good for judges).
- [ ] *T9.4* Memory decay: lower the ranking of old, never-recalled memories; track a `recallCount`.
- [ ] *T9.5* Cross-project recall for global entities (e.g. "how did I configure the paymaster in my other repo?").

## 8. Time plan (IST)

| When | Goal |
|---|---|
| Fri 16 Oct night | T0, T1, T2 done; curl-level remember/recall works |
| Sat 17 Oct | T3, T4, T5: Claude Code auto-capture working end to end; start dogfooding |
| Sat night | T6 (Cursor + Gemini CLI/Antigravity) |
| Sun 18 Oct AM | T7 web UI, seed script polished |
| Sun 18 Oct PM | T8: README, video, blog, deploy decision. **Submit by ~10 PM** for buffer |

If behind schedule, cut in this order: T9 → T6.3/T6.4 → T7.4 → `UserPromptSubmit` hook. Never cut: auto-capture, supersession, provenance, the graph view.

## 9. Risks and mitigations

All `RESEARCH:` flags were verified on 2026-10-16 (see PROGRESS.md) — no API blocked the plan, but two
risks shifted from "unknown syntax" to "known constraint":

- **Extraction quality is noisy.** Keep memories atomic, add confidence and a minimum threshold, and rely on the seed script for the video.
- **MCP cwd is not the workspace in Claude Desktop.** Confirmed no cwd/workspace concept there — scope Desktop installs to `engram_global` only, don't rely on it for the repo-scoped demo. Cursor and Gemini CLI both confirmed to support explicit `cwd`/`env`, so `ENGRAM_CWD` is the real primary mechanism (MCP "roots" are deprecated, not just unreliable).
- **Antigravity has no confirmed local MCP server support.** Only UI-driven remote connectors are documented. Demoted to stretch (T6.3) — demo with Gemini CLI instead.
- **`SessionEnd` hook has a tiny (~1.5s default) execution budget.** Keep its body fire-and-forget to the daemon; don't wait on extraction synchronously there.
- **Agents don't call `engram_recall` on their own.** Write strong tool descriptions, add a rules snippet (T6.5), and use the SessionStart hook in Claude Code.
- **Secrets in transcripts.** Redact before storage and before any LLM call (T4.2); document it in the README.
- **Embedding dimension mismatch** after switching provider. Store the dim in config and refuse to start with a clear error if it changes.
- **Vector writes without `vecf32()` silently degrade to full scans.** Wrap every write to `Memory.embedding`, not just reads (§3.4).
