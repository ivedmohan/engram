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

## Next

- T0: `git init`, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `docker-compose.yml`.
- T1: graph layer (`client.ts`, `project.ts`, `schema.ts`, `queries.ts`) + `scripts/smoke.ts`.

## Open questions

- Which LLM provider key does Ved actually have for T4.1 (Anthropic / OpenAI / Gemini)? Needed before
  extraction/reconciliation can be built — pick one and wire Ollama for local embeddings alongside it.
- Deploy decision for T8.3 (read-only web UI against FalkorDB Cloud vs. local-only + video) — defer to
  Sunday per the plan, but flag now that FalkorDB Cloud free-tier limits weren't checked in this pass.

## Gotchas

- `Memory.embedding` writes MUST use `vecf32($vec)` — a plain array silently fails to use the vector
  index (falls back to full scan with no error).
- Full-text index creation must use `CREATE FULLTEXT INDEX FOR (n:Label) ON (n.prop)`, not
  `db.idx.fulltext.createNodeIndex`, on FalkorDB 6.x.
- `@modelcontextprotocol/sdk` is mid-transition to v2 — always check the installed version's own
  `.d.ts` before trusting a blog post or older tutorial on tool registration.
- Don't build the live demo around Antigravity — no confirmed local MCP config surface.
