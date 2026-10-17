"use client";

import { useState } from "react";

export function CopyButton({ text, dark = false }: { text: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in this context — the command is still visible to copy by hand.
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        background: dark ? "transparent" : "transparent",
        border: `1px solid ${dark ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.25)"}`,
        color: "#fff",
        borderRadius: 6,
        padding: "5px 10px",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
