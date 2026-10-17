import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F, Logo, Rise } from '../theme';

const pills = ['local-first', 'FalkorDB on your hardware', 'secrets redacted', 'MCP: Claude Code · Cursor · Gemini CLI'];

export const Close: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans, color: C.text, alignItems: 'center' }}>
    <Rise at={0.1} style={{ marginTop: 220 }}><Logo size={96} /></Rise>
    <Rise at={0.5} style={{ marginTop: 30, fontFamily: F.serif, fontSize: 96, fontWeight: 600 }}>Engram</Rise>
    <Rise at={1.5} style={{ marginTop: 6, fontFamily: F.serif, fontSize: 42, color: C.muted }}>One memory, read by every AI tool on your machine.</Rise>
    <div style={{ display: 'flex', gap: 16, marginTop: 56 }}>
      {pills.map((p, i) => (
        <Rise key={p} at={2.0 + i * 0.6} style={{ fontFamily: F.mono, fontSize: 21, padding: '10px 18px', borderRadius: 99, background: C.cream, border: `1.5px solid ${C.cream2}` }}>{p}</Rise>
      ))}
    </div>
    <Rise at={6.4} style={{ marginTop: 70, fontFamily: F.mono, fontSize: 32, fontWeight: 600, color: C.accent }}>engram-folkdb.vercel.app</Rise>
    <Rise at={7.0} style={{ marginTop: 16, fontFamily: F.mono, fontSize: 19, color: C.muted }}>Built for Graph Hacks · WeMakeDevs × FalkorDB</Rise>
  </AbsoluteFill>
);
