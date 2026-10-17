import { CopyButton } from "./CopyButton";

export function CodeBlock({ lines, copyText, style }: { lines: React.ReactNode[]; copyText: string; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#1c1c1e", borderRadius: 8, overflow: "hidden", border: "1px solid var(--hairline-strong)", ...style }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "#a8a8a8",
        }}
      >
        <span>terminal</span>
        <CopyButton text={copyText} dark />
      </div>
      <pre style={{ margin: 0, padding: "14px 16px", overflowX: "auto" }}>
        <code style={{ color: "#fff", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre" }}>
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </code>
      </pre>
    </div>
  );
}
