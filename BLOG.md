# Your AI tools don't share a brain, and that's a graph problem

I use four or five AI coding tools in a given week — Claude Code for the gnarly stuff, Cursor for
quick edits, Gemini CLI when I want a second opinion. Every one of them is excellent in the moment and
useless the moment I switch. I'll spend twenty minutes in Claude Code deciding to rip out Express for
Hono, explain exactly why, pick pnpm over npm while I'm at it — and then open Cursor an hour later and
it asks me what framework the relayer is even on.

That's not a model problem. It's a storage problem. So for the FalkorDB "Graph Hacks" hackathon I
built Engram: one memory, stored in a graph, that every AI tool on my machine reads from and writes to.

## Why not just throw it in a vector store

The obvious first answer to "give agents memory" is: embed everything, stuff it in a vector DB, do
similarity search. That's most of what's out there today, and it has a specific failure mode that
only shows up once memory is genuinely load-bearing: **it can't tell old from current.**

If I tell an agent "we use Express" on Monday and "actually, we switched to Hono" on Thursday, a
vector store happily returns both when asked "what framework do we use" — they're both semantically
about the relayer's framework, so both score well. Nothing in that representation encodes *replaces*.
You either bolt on recency-weighting (which just means old wrong answers fade slowly instead of
disappearing) or you accept that your memory system will occasionally hand an agent a decision you
already reversed, stated with full confidence.

A graph doesn't have this problem, because supersession is just an edge:

```
(:Memory {text: "Relayer uses Hono"})
  -[:SUPERSEDES {reason: "switched for built-in validators"}]->
(:Memory {text: "Relayer uses Express", status: "superseded"})
```

Recall filters to `status: active` by default. The old memory isn't deleted — ask for the full history
and it's right there, with the edge explaining why it changed — but nobody has to accidentally stumble
onto it.

## The three places graph structure actually did work

I went in expecting "it's a graph" to be mostly a pitch-deck detail over what's functionally a
database with extra steps. Three things changed my mind while building it:

**Provenance is a traversal, not a column.** "Which tool said this, in which session, when, and what
did it replace" is naturally `Tool -[:RAN]-> Session -[:CAPTURED]-> Memory -[:SUPERSEDES]-> Memory`.
I didn't design a `provenance` JSON blob and then have to keep it in sync — the answer to "explain this
memory" is just "walk the edges," and it's always correct because there's nothing to desync.

**Recall genuinely gets better from graph expansion, not just lexical matching.** Full-text search on
"what framework does the relayer use" only finds memories that literally mention "relayer." But if a
memory only says "uses Hono" and never says "relayer," a one-hop walk through `RELATED_TO` entity
edges (bumped every time two entities co-occur in the same memory) still surfaces it. This is the one
piece I was genuinely skeptical would matter in practice and then watched it matter in the first real
test.

**Multigraph isolation is free.** FalkorDB hosts one named graph per project plus a global one, on a
single instance, with zero extra infrastructure. Project A's decisions can never leak into Project B's
recall — not because I wrote a filter, but because they're different graphs.

## What actually broke (the interesting part)

The parts of this that *should* have been simple were the parts that bit me, because the simple-looking
APIs had undocumented behavior you only find by running real queries against real data.

FalkorDB's query results come back as **objects keyed by `RETURN` alias** — `RETURN m, score` is
`{m: {...}, score: ...}`, not a positional array. I wrote the first version of every query function
assuming the second shape. It compiled fine, ran fine, and silently returned nothing useful, because
indexing into an object with `[0]` just gives `undefined` — no error, no crash, just quietly wrong.
The fix was two minutes once I found it; finding it took an hour of staring at correct-looking code.

Its full-text index is RediSearch under the hood, which means a plain multi-word query string is
parsed as an implicit AND/phrase match. "What framework does the relayer use" — a completely normal
thing to ask — matched *nothing*, even though a memory containing the word "relayer" was sitting right
there, because the query didn't *also* contain every other word in that sentence verbatim. The fix is
small (strip stop words, OR-join what's left) but you'd never guess you need it from the docs.

And the model I actually wanted to use for extraction — Moonshot's Kimi K2, which Groq's own
documentation lists as a hosted model — simply wasn't available on the API key I was testing with. Not
a permissions error with a helpful message; a flat 404. The fix was boring (hit `/v1/models`, see
what's actually there, use that instead), but it's a good reminder that a model being documented and a
model being available to *your* key are two different facts.

None of these are exotic bugs. They're the ordinary tax of building on infrastructure you haven't used
before, and the only real lesson is the unglamorous one: run the actual query, read the actual
response shape, don't trust what the code *should* do.

## Where it landed

Claude Code captures memory automatically via a session hook — you never say "remember this," you just
talk, and decisions land in the graph when the session ends. Cursor and Gemini CLI read the same graph
over MCP; a tiny prompt nudge (`engram_recall` at the start of a task) is the only thing that makes up
for them not having a hooks system of their own. There's a local web UI that draws the actual graph —
nodes colored by status, the `SUPERSEDES` edge highlighted — which turned out to be the most convincing
part of the demo, because it's not a diagram of the idea, it's the actual data.

The part I'd point to if I only had one thing to show: ask a different tool than the one that made the
decision, and it gets the current answer, with the history to back it up. That's the whole pitch, and
it only works because the thing underneath is a graph.
