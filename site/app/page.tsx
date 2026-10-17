import Image from "next/image";
import { CodeBlock } from "./CodeBlock";
import { CopyButton } from "./CopyButton";
import screenshot from "../public/web-ui.jpg";

const wrap: React.CSSProperties = { maxWidth: 920, marginInline: "auto" };
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--steel)",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "fit-content",
  background: "var(--cream)",
  border: "1px solid var(--beige-deep)",
  borderRadius: 100,
  padding: "5px 12px 5px 10px",
};
const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", display: "inline-block" };
const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontFamily: "var(--font-body)",
  fontWeight: 500,
  fontSize: 14,
  padding: "10px 20px",
  borderRadius: 8,
  border: "1px solid transparent",
  cursor: "pointer",
  textDecoration: "none",
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: "var(--primary)", color: "#fff" };
const btnOutline: React.CSSProperties = { ...btnBase, background: "var(--canvas)", color: "var(--ink)", borderColor: "var(--hairline-strong)" };
const stepNum: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "var(--cream)",
  border: "1px solid var(--beige-deep)",
  display: "grid",
  placeItems: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  color: "var(--ink)",
  flexShrink: 0,
  marginTop: 2,
};

function Step({ n, title, note, children }: { n: number; title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 18, paddingBlock: 22, borderTop: n === 1 ? "none" : "1px solid var(--hairline)" }}>
      <div style={stepNum}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-body)", marginBottom: 4 }}>{title}</h3>
        {note && <p style={{ fontSize: 13.5, color: "var(--steel)", marginBottom: 12, lineHeight: 1.55, marginTop: 0 }}>{note}</p>}
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main style={{ paddingInline: 24 }}>
      <div style={wrap}>
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBlock: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--primary)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 600, fontSize: 16, flexShrink: 0 }}>E</div>
            Engram
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 14, fontWeight: 500, flexWrap: "wrap" }}>
            <a href="#install" style={{ color: "var(--ink)" }}>Installation</a>
            <a href="#why" style={{ color: "var(--ink)" }}>Why a graph</a>
            <a href="https://github.com/ivedmohan/engram" style={{ color: "var(--ink)" }}>GitHub ↗</a>
            <a href="https://github.com/ivedmohan/engram" style={btnOutline}>View source</a>
          </div>
        </nav>

        <section style={{ paddingBlock: "56px 40px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
          <span style={eyebrow}><i style={dot} />Graph Hacks — WeMakeDevs × FalkorDB</span>
          <h1 style={{ fontSize: "clamp(2.1rem, 5vw, 3.1rem)", lineHeight: 1.12, letterSpacing: "-0.5px" }}>
            One memory, read by every AI tool on your machine.
          </h1>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.6, color: "var(--steel)", maxWidth: "56ch", margin: 0 }}>
            Decide something in Claude Code and Cursor still thinks it&apos;s outdated. Engram is a local-first memory
            layer backed by a graph in FalkorDB — every tool reads and writes the same memory, and because it&apos;s a
            graph, it always knows which decision is current.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 6 }}>
            <a href="#install" style={btnPrimary}>Get started →</a>
            <a href="https://github.com/ivedmohan/engram" style={btnOutline}>View on GitHub</a>
          </div>

          <div
            style={{
              marginTop: 8,
              background: "var(--ink)",
              color: "#fff",
              borderRadius: 8,
              padding: "13px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 13.5,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>docker compose up -d &amp;&amp; npm install &amp;&amp; npm run build &amp;&amp; node dist/cli.js up</span>
            <CopyButton text="docker compose up -d && npm install && npm run build && node dist/cli.js up" />
          </div>
        </section>

        <div style={{ border: "1px solid var(--hairline)", borderRadius: 12, overflow: "hidden", marginBlock: "8px 48px", boxShadow: "rgba(0,0,0,0.06) 0px 12px 32px -8px" }}>
          <Image src={screenshot} alt="Engram's web UI: a memory graph showing Relayer uses Hono superseding Relayer uses Express, with the full provenance chain in the detail panel" style={{ display: "block", width: "100%", height: "auto" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--steel)", marginTop: -38, marginBottom: 48, lineHeight: 1.5 }}>
          Real output from a running daemon — not a mockup. &quot;Relayer uses Express&quot; was superseded automatically
          when a later Claude Code session decided to switch to Hono; Cursor and Gemini CLI read the same graph over MCP.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBlock: 48 }}>
          {[
            { num: "01", title: "Supersession, not similarity", body: <>A vector store can&apos;t tell old from current — both score well on &quot;what framework do we use.&quot; Engram models replacement as a real edge: <code className="mono">(:Memory)-[:SUPERSEDES]-&gt;(:Memory)</code>.</> },
            { num: "02", title: "Provenance as a traversal", body: <>Which tool, which session, when, and what it replaced is a path you can walk — <code className="mono">Tool→Session→Memory</code> — not a field that can drift out of sync.</> },
            { num: "03", title: "Zero effort capture", body: <>A Claude Code session hook extracts memories automatically when a session ends. You never say &quot;remember this&quot; — it&apos;s already there next time.</> },
          ].map((p) => (
            <div key={p.num} style={{ background: "var(--canvas)", border: "1px solid var(--hairline)", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--primary)" }}>{p.num}</span>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, fontFamily: "var(--font-body)" }}>{p.title}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--steel)", margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>

        <div id="install" style={{ paddingTop: 16 }}>
          <span style={{ ...eyebrow, marginBottom: 14 }}><i style={dot} />Installation</span>
          <h2 style={{ fontSize: "1.9rem", marginTop: 14 }}>Six steps, five minutes</h2>
          <p style={{ color: "var(--steel)", fontSize: "1rem", maxWidth: "60ch", lineHeight: 1.6, marginTop: 10 }}>
            FalkorDB runs locally in Docker with no auth. The only thing that leaves your machine is the extraction
            call to Groq (bring your own key, free tier works) — and secrets are redacted before that call happens.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
          <Step n={1} title="Start FalkorDB" note="Local Docker container, no auth. Browser UI on :3000 if you want to poke at the raw graph.">
            <CodeBlock copyText="docker compose up -d" lines={["docker compose up -d"]} />
          </Step>
          <Step n={2} title="Install and build">
            <CodeBlock copyText={"npm install\nnpm run build"} lines={["npm install", "npm run build"]} />
          </Step>
          <Step n={3} title="Add your Groq key" note={<>Free tier works. <a href="https://console.groq.com">console.groq.com</a> — used only for turning a conversation into structured memories.</>}>
            <CodeBlock copyText="cp .env.example .env" lines={["cp .env.example .env", <span key="c" style={{ color: "#8a8a8a" }}># edit .env: GROQ_API_KEY=gsk_...</span>]} />
          </Step>
          <Step n={4} title="Start the daemon" note="Binds to 127.0.0.1 only — nothing is exposed beyond your machine.">
            <CodeBlock copyText="node dist/cli.js up" lines={["node dist/cli.js up", <span key="c" style={{ color: "#8a8a8a" }}># → engram daemon listening on http://127.0.0.1:7777</span>]} />
          </Step>
          <Step n={5} title="Open the web UI">
            <CodeBlock copyText="open http://127.0.0.1:7777" lines={["open http://127.0.0.1:7777"]} />
          </Step>
          <Step n={6} title="Wire it into your tools" note="Registers the MCP server (and, for Claude Code, the session hooks that make capture automatic).">
            <CodeBlock
              copyText={"node dist/cli.js install claude-code\nnode dist/cli.js install cursor\nnode dist/cli.js install gemini-cli"}
              lines={["node dist/cli.js install claude-code", "node dist/cli.js install cursor", "node dist/cli.js install gemini-cli"]}
            />
          </Step>
        </div>

        <div id="why" style={{ paddingTop: 12, marginTop: 12 }}>
          <span style={eyebrow}><i style={dot} />No live session handy?</span>
          <h2 style={{ fontSize: "1.9rem", marginTop: 14 }}>Reproduce the demo without any LLM calls</h2>
          <p style={{ color: "var(--steel)", fontSize: "1rem", maxWidth: "60ch", lineHeight: 1.6, marginTop: 10 }}>
            A deterministic seed script rebuilds the exact Express→Hono supersession shown above, directly against the
            graph layer.
          </p>
          <CodeBlock copyText="npm run seed-demo" lines={["npm run seed-demo"]} style={{ marginTop: 20, maxWidth: 480 }} />
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 100,
            marginBlock: "56px 28px",
            background: "linear-gradient(90deg, var(--primary), var(--sunshine-700), var(--sunshine-500), var(--yellow), var(--cream))",
          }}
        />

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", paddingBlock: "4px 40px", fontSize: 13, color: "var(--steel)" }}>
          <span>Built for Graph Hacks: Context for AI Agents (WeMakeDevs × FalkorDB), Track 02.</span>
          <a href="https://github.com/ivedmohan/engram" style={{ color: "var(--ink)" }}>github.com/ivedmohan/engram ↗</a>
        </footer>
      </div>
    </main>
  );
}
