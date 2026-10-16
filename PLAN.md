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
  **Correction (found 2026-10-17 while prepping T8.1):** the original `tsconfig.json` had
  `rootDir: "."` to accommodate `scripts/**` alongside `src/**`, which made `tsc` emit to
  `dist/src/cli.js` instead of `dist/cli.js` — silently breaking the `bin` field above and every
  self-referential path computation that assumes a specific nesting depth (daemon's `process.chdir()`,
  MCP server's daemon-path resolution, installer command resolution). This went unnoticed for all of
  T0–T7 because only `tsc --noEmit` was run, never an actual `npm run build`. Fixed: `rootDir: "./src"`,
  dropped `scripts/**` from this config (scripts are dev-only, run via `tsx`, never built), added
  `tsconfig.scripts.json` for still type-checking them. Verified by running the actual built
  `dist/cli.js`/`dist/mcp/server.js`/`dist/daemon/server.js` end to end, not just recompiling cleanly.
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

### T3. MCP server (MUST) — ✅ done 2026-10-16, verified with a real MCP client connection over stdio
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
- **Done when:** MCP Inspector (`npx @modelcontextprotocol/inspector`) lists and runs all tools. ✅ verified
  with a scripted `Client` + `StdioClientTransport` connection instead (more reliable to check headlessly
  than the Inspector's browser UI) — `listTools()` returns all 5 tools, and calling `engram_recall` with
  `ENGRAM_TOOL=cursor ENGRAM_CWD=/tmp/demo-relayer` and the query "what framework does the relayer use"
  returns `[decision] Relayer uses Hono (supersedes: "Relayer uses Express") — via claude-code" — the
  exact §2 demo claim, through the real MCP protocol end to end.

### T4. Extraction + reconciliation (MUST) — target: Sat 17 Oct
- [x] T4.1 `llm/provider.ts` interface + Groq provider — ✅ done 2026-10-16, tested live.
  **Provider decision:** Groq, BYOK (user supplies their own `GROQ_API_KEY`; this is the only
  provider with a user-supplied-key path for now — not Anthropic/OpenAI/Gemini).
  **Model decision, found by actually calling the API, not by trusting docs:** research recommended
  `moonshotai/kimi-k2-instruct-0905` (Kimi K2), but that model id 404s ("does not exist or you do not
  have access to it") on this account/key — so does the undated `moonshotai/kimi-k2-instruct`. A live
  `GET /openai/v1/models` call showed Kimi K2 isn't in this key's available model list at all (only
  `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, and a few audio/guard models are).
  **Defaulted to `openai/gpt-oss-120b` instead** — this is arguably the better choice anyway: Groq's
  docs confirm gpt-oss-120b is on the **strict `json_schema` whitelist** (100% guaranteed valid JSON),
  while Kimi K2 is only best-effort `json_object` mode. Override via `GROQ_MODEL` env var if a given
  account does have Kimi K2 access. Live-tested: fed the exact §2 demo line ("Let's switch the relayer
  from Express to Hono, and we always use pnpm in this repo") through `GroqProvider.complete()` with
  `json_object` mode and got back correctly-classified JSON — one `decision` (Express→Hono) and one
  `preference` (pnpm), with entities tagged. Zod validation + retry-once (per this task's own
  requirement) still needs wiring into the real `extract.ts` pipeline (T4.4) — this only proves the
  provider call itself works end to end against live Groq, not the full pipeline yet.
  `ollama.ts` for embeddings: not yet built — deferred, see note on T4.5 below.
- [x] T4.2 `memory/redact.ts` — ✅ done 2026-10-16. Patterns for Anthropic/Groq/OpenAI/Google/GitHub/Slack
  keys, AWS access key ids, JWTs, PEM blocks, 0x-prefixed eth private keys, `KEY=value`-style env lines,
  and a 12/24-word mnemonic heuristic. **Found and fixed a real false-positive while writing the test
  suite:** a naive "12 lowercase words in a row" regex flags ordinary prose (any 12-word sentence made
  of short words) as a possible seed phrase — fixed by rejecting any candidate run containing common
  function words (the/a/is/we/to/...), since real mnemonics never do. 13/13 tests pass
  (`npm run` via `scripts/test-redact.ts`), including both the false-positive-prevention case and a
  true-positive nonsense-word case.
  **Separate near-miss, not a redact.ts bug:** while writing the test file, the REAL Groq key (pasted
  earlier in chat) was used as a literal fixture instead of a fake one. GitHub's push protection caught
  it before it reached the remote; the unpushed commit was amended to use fake fixtures instead and
  re-verified clean before pushing. See PROGRESS.md for the full incident note.
- [x] T4.3 `llm/prompts.ts` — ✅ done. Extraction prompt (3 few-shot examples: a decision+preference
  extraction, a "nothing worth remembering" restraint example, and a global-scope preference example)
  and reconciliation prompt (4 few-shot examples: ADD, SUPERSEDE — the Express→Hono example from this
  task — DUPLICATE, and CONTRADICT). Both paired with zod schemas (`ExtractionResultSchema`,
  `ReconciliationResultSchema`) for the validation layer in T4.1's `completeJsonValidated`.
- [x] T4.4 `memory/extract.ts` → `memory/reconcile.ts` → `memory/write.ts`, wired into `/ingest`'s queue
  job in `daemon/routes.ts` — ✅ done, verified live end to end (not just unit-level):
  seeded "Relayer uses Express" via `/memories`, then POSTed the exact §2 demo line to `/ingest`; the
  daemon log showed `2 candidate(s) -> SUPERSEDE(<express-id>), ADD` and the graph confirmed Express
  flipped to `status: superseded` with a real `SUPERSEDES` edge to the new Hono memory — fully automatic,
  no manual `/memories/supersede` call.
  **Reliability note found during testing:** reconciliation is an LLM judgment call, not a deterministic
  function — on one early run (before the bug below was found) it classified the same Hono-vs-Express
  pair as `ADD` instead of `SUPERSEDE`. Isolated testing (3/3 consistent `SUPERSEDE`) suggests the model
  itself is actually fairly reliable on this exact case; log reconciliation decisions in production so
  occasional misses are visible, and lean on T4.6's deterministic seed script for anything that must not
  depend on model judgment (the demo video).
  `findMemoryByHash` exact-dedup and the `findSimilarMemories` (fulltext + entity-expand) candidate
  lookup both reuse T2's existing query functions — no new graph-layer code was needed for this.
- [ ] T4.5 `recall.ts` implementing §6.2 — **not built as a separate module**; its logic (vector +
  fulltext + entity-expand, merge, rank) already lives inline in `daemon/routes.ts`'s `/recall` handler
  from T2, minus the vector-search leg (no embedding provider wired yet — see T4.1). Recall already
  works for the demo without it (fulltext + entity-expand alone). Extracting it into its own module is
  pure refactoring, not new capability — deprioritized below T5/T6 unless time allows.
- [x] T4.6 `scripts/seed-demo.ts` — ✅ done, verified: reproduces the exact §2 end-state (Express
  superseded → Hono active, pnpm active, across a Tuesday/Thursday/Thursday session timeline with a
  Cursor session registered for the recall step) directly against the graph layer, no LLM calls. Derives
  the project slug via the real `resolveProject()` — not a hardcoded slug — so the daemon serving
  `cwd=/tmp/demo-relayer` actually sees the seeded data; confirmed via live `/context` and `/recall`
  calls after running the script fresh.
- **Done when:** feeding the §2 conversation text to `/ingest` produces the right memories and a SUPERSEDES edge, and `/recall` for "relayer framework" returns Hono first with provenance. ✅ both verified live.

### T5. Claude Code integration (MUST) — automatic capture — ✅ done 2026-10-16, verified via simulated hook invocations
- [x] T5.1 VERIFIED (code.claude.com/docs/en/hooks): all five events exist exactly as assumed, plus a larger set
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
- [x] T5.2 `transcripts/claude-code.ts` — ✅ done. **Schema confirmed by reading this very session's own
  real transcript file directly** (ground truth, not docs — Claude Code doesn't publish this JSONL
  schema): each line is `{type, message: {role, content}, timestamp, ...}`. `type:"user"` with a
  STRING `content` is real human text; `type:"user"` with an ARRAY `content` is tool-result feedback
  (drop). `type:"assistant"` content is always an array of blocks — `thinking` (drop), `tool_use`
  (drop), `text` (keep). Everything else (`system`, `file-history-snapshot`, `mode`, ...) is harness
  bookkeeping (drop). Tested against the real 1630-line transcript for this project: correctly
  extracted 160 clean conversational messages.
- [x] T5.3 `hooks/claude-code.ts` + CLI `engram hook <event>` — ✅ done, verified with simulated stdin
  matching real Claude Code hook payloads (a fake transcript file in the confirmed schema + a seeded
  existing memory): `SessionStart` printed the right `/context` markdown; `Stop` automatically produced
  a `SUPERSEDE` + an `ADD` with **zero manual `/ingest` calls** — the actual automatic-capture pitch,
  working end to end through the hook interface a real Claude Code session would use.
  - `SessionStart`: prints `/context` markdown via plain stdout.
  - `Stop`: parses the transcript from `Session`'s local offset file (`~/.engram/offsets/<id>.offset`,
    not a graph property — avoids a network round-trip before sending), appends `last_assistant_message`
    if the transcript parse didn't already capture it (handles the documented lag), POSTs to `/ingest`.
    Every handler is wrapped so it can never throw past the CLI's own top-level catch; `cli.ts` always
    sets `process.exitCode = 0` for the `hook` command regardless of what happened inside.
  - `SessionEnd` / `PreCompact`: same flush, but `SessionEnd` skips `ensureDaemonRunning()` (would blow
    the ~1.5s budget) and uses a 1000ms fetch timeout via `daemonFetch`'s new `timeoutMs` param.
  - *STRETCH* `UserPromptSubmit`: not built — correctly deprioritized, see §8 cut order.
  - Refactored the daemon-connection logic (`ensureDaemonRunning`/`daemonFetch`) out of `mcp/server.ts`
    into a shared `src/daemon/rpc.ts` so hooks and the MCP server don't duplicate it; re-verified the
    MCP server still works end to end after the refactor (same live-MCP-client test as T3).
- [x] T5.4 `src/install/claude-code.ts` + `engram install claude-code [--scope user|project]` — ✅ done.
  Hooks merge (`mergeEngramHooks`) is a pure function, unit-tested (12/12 passing in
  `scripts/test-install.ts`) against synthetic "existing settings with an unrelated hook already
  present" input — confirmed it never clobbers an existing hook on the same event, is idempotent on
  re-install, and the file-writing wrapper backs up the original before overwriting. **Deliberately
  NOT run against this repo's real `.claude/settings.local.json` or `~/.claude/settings.json` yet** —
  doing so would start firing hooks (and real Groq API calls) on every future Stop event in live
  sessions, including this one, which is a behavior change worth the user's explicit go-ahead rather
  than something to flip on silently mid-build. MCP registration shells out to the real `claude mcp add`
  (confirmed command shape from T3's research); Engram's "project" scope maps to `--scope local`
  (personal, not the shared `.mcp.json`) for the same "don't impose this on teammates" reasoning as the
  hooks file choice (`.claude/settings.local.json`, not the shared `.claude/settings.json`).
- **Done when:** a real Claude Code session in a test repo produces memories with no manual action, and a new session starts with them in context. ✅ verified via simulated hook stdin (see T5.3) — not yet exercised via an ACTUAL live Claude Code session, since that requires running `engram install claude-code` for real (see T5.4 note).

### T6. Other clients (MUST: Cursor + Gemini CLI; Claude Desktop nice-to-have; Antigravity demoted — see below) — ✅ T6.1/T6.2/T6.4/T6.5 done 2026-10-16
- [x] T6.1 `engram install cursor` (`src/install/cursor.ts`) — ✅ done, unit-tested against a scratch
  project root (never the real `~/.cursor/mcp.json` — confirmed via inspection that the user's real,
  pre-existing Cursor MCP config with 5 other servers was untouched). `.cursor/mcp.json` (project) or
  `~/.cursor/mcp.json` (global). Since Cursor's config has no confirmed `cwd` field, the project root
  is baked directly into `env.ENGRAM_CWD` at install time instead of relying on the client to launch
  with the right working directory.
- [x] T6.2 `engram install gemini-cli` (`src/install/gemini-cli.ts`) — ✅ done, unit-tested the same way
  (scratch dir only). `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project) — sets both
  the confirmed `cwd` field AND `env.ENGRAM_CWD` for robustness. **Documented asymmetry:** unlike
  Claude Code's `.local.json` convention, no gitignored variant is confirmed for Gemini CLI, so project
  scope here really is shared with anyone who clones the repo — the CLI prints a note about this.
- [ ] T6.3 Antigravity: **DEMOTED to stretch, do not plan the demo around it.** RESEARCH confirmed it's a real, current Google IDE with MCP support, but only UI-driven ("MCP Store") remote/cloud connectors (Workspace, BigQuery, AlloyDB) are documented — no public config file path or JSON shape for a custom local stdio server was found. Treat as unresolved; only attempt if time remains and you can test it directly.
- [x] T6.4 `engram install claude-desktop` (`src/install/claude-desktop.ts`) — ✅ done. No `--scope`
  (Desktop has no per-project workspace). **Known, documented limitation:** without `ENGRAM_CWD`, the
  MCP server falls back to `process.cwd()` rather than cleanly defaulting to global-only scope —
  fixing that needs a small change to `mcp/server.ts`'s default-scope logic, not made since Desktop is
  explicitly lower priority than Claude Code/Cursor/Gemini CLI.
- [x] T6.5 Rules snippet (`src/install/rules-snippet.ts`, `ensureRulesSnippet`) — ✅ done, opt-in via a
  `--with-rules` flag on `install cursor`/`install gemini-cli` (matches the plan's "can offer to
  append it" — never forced). Appends (never overwrites) a short "call engram_recall at the start of a
  task, call engram_remember on a decision" nudge to `AGENTS.md`/`GEMINI.md`, idempotent via an HTML
  comment marker. **This turned out to matter more than "nice-to-have":** Cursor and Gemini CLI have no
  hooks system — without this nudge, an agent there has no automatic trigger to ever call
  `engram_recall` at all, unlike Claude Code where the SessionStart hook does it automatically.
  Unit-tested: creates, is idempotent, and preserves a human's existing file content when appending.
- [ ] T6.5 Optional rules snippet for clients without hooks (Cursor rules / GEMINI.md / AGENTS.md): "At the start of a task call `engram_recall`; when a decision is made, call `engram_remember`." `engram install` can offer to append it.
- **Done when:** the §2 demo steps 3–4 work live with Cursor + Gemini CLI (swap "Gemini CLI (or Antigravity)" in §2 step 4 to just "Gemini CLI").

### T7. Web UI (MUST) — ✅ done 2026-10-17, verified visually in a real browser against live data
- [x] T7.1 `src/web/index.html` served at `/` — project picker (populated from `/projects`), search box
  wired to `/recall`, graph view, timeline. Uses Cytoscape.js from a CDN (no build step, per the stack
  decision) since this is served directly by the daemon, not an Artifact — no CSP restrictions apply.
  **Real portability bug found and fixed:** `@hono/node-server`'s `serveStatic({root})` resolves `root`
  relative to `process.cwd()` **eagerly at middleware-setup time** (checked with `existsSync` the
  moment `serveStatic()` is called, not lazily per-request), but the daemon can be auto-started from
  any project's directory via hooks/MCP (T3.3/T5.3's `ensureDaemonRunning`), not just this repo's root.
  Fixed with an explicit `process.chdir()` to this package's own directory, placed BEFORE the static
  middleware is registered (ESM import hoisting means this ordering is about statement execution order
  in the file, not import resolution — verified by actually starting the daemon from `/tmp` and
  confirming both the static file and `cwd`-based API calls still worked correctly).
- [x] T7.2 Graph view from `/graph` — ✅ done and VISUALLY VERIFIED (via a real Chrome session, not just
  "it compiles"): nodes colored by label (violet=active Memory, dashed amber=superseded Memory,
  teal=Entity, blue=Project/Session/Tool), `SUPERSEDES` edge rendered thick and violet with a label.
  **Layout finding:** started with `cose` (force-directed) per the original plan, but random initial
  positions caused real node-label overlaps in testing, and retuning repulsion/spacing parameters
  three times just moved the overlap to a different node pair each time rather than eliminating it.
  Switched to `breadthfirst` (built into Cytoscape core, no extra plugin) since this graph is naturally
  layered (Tool → Session → Memory → Entity) — deterministic, reproducible across reloads (important
  for a demo video), and eliminated the overlaps entirely rather than reducing them.
- [x] T7.3 Memory detail panel from `/explain/:id` — ✅ done and verified: clicking a Memory node (or a
  timeline row, or a recall result) loads real provenance — kind/status/tool badges, timestamp, entity
  chips, and the supersession chain ("Supersedes 'Relayer uses Express'") — via the actual `/explain`
  endpoint, not mocked data.
- [x] T7.4 Timeline grouped by tool — ✅ done, verified showing all 3 demo memories with correct
  timestamps and tool attribution, clickable to load detail.
- [x] T7.5 Dark mode — ✅ done and visually verified via screenshot (the page only implements the dark
  palette for now, matching `prefers-color-scheme: dark`; a light-mode fallback exists via the same
  `:root` tokens but hasn't been screenshot-checked — lower priority since T7.5 specifically calls out
  dark mode as the hero shot).
- **Not yet done:** recall query in the search box currently only jumps to the TOP result's detail
  panel, not a full results list — acceptable for the demo (which has one clear best answer) but would
  need a proper results list for a project with many plausible matches. Also not done: a visible loading
  state while `/graph`/`/timeline` fetch (brief flash of empty state on slow networks) — fine for
  localhost, would matter for the FalkorDB-Cloud-backed read-only deploy option in T8.3 if that's chosen.

### T8. Ship (MUST) — Sun 18 Oct, finish by ~9 PM IST
- [x] T8.1 README — ✅ done 2026-10-17. Problem statement, "why a graph" section (supersession,
  provenance, graph expansion, multigraph isolation), quick start, architecture diagram, client support
  table, privacy section, hackathon track. **Every command in the quick start was actually run, not
  just written** — `docker compose up -d`, `npm install && npm run build`, `node dist/cli.js up` (from
  a throwaway dir, to catch exactly the kind of path bug found above), `node dist/cli.js install
  cursor/gemini-cli --scope project` (also from a throwaway dir — confirmed real generated JSON with
  the correct built MCP server path). **Gap, documented rather than overclaimed:** `install claude-code`
  still wasn't run for real end-to-end, since its MCP-registration half shells out to the real `claude
  mcp add`, which would mutate the actual `~/.claude.json` regardless of which directory it's run
  from — same boundary held since T5/T5.4.
  Used a **real screenshot from the actual running web UI** (`docs/web-ui.jpg`, captured via the
  claude-in-chrome browser tool) instead of a placeholder GIF — honest proof the thing works, even
  though a proper demo video still needs to be recorded (T8.2).
- [ ] T8.2 Demo video (2–3 min) following §2 exactly. Use `seed-demo.ts` as a fallback.
  **Blocked on Ved** — recording/narrating a video isn't something that can be done autonomously.
- [ ] T8.3 Deployment: since this is local-first, deploy a **read-only demo** of the web UI against FalkorDB Cloud with the seeded graph (app.falkordb.cloud), OR clearly document local setup and rely on the video. Decide by Sun noon.
  **Blocked on Ved** — needs a decision (and possibly a FalkorDB Cloud account) only he can make/provide.
- [ ] T8.4 `BLOG.md` (side prize: best blog post): the daily pain, why vector memory isn't enough, the graph model, supersession, and lessons learned.
- [ ] T8.5 Submit on WeMakeDevs **before 11:59 PM IST, 18 Oct**. Re-read the rules page first.
  **Blocked on Ved** — requires his actual hackathon account/submission.

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
