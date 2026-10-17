import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { C, F, Rise, ease, useT } from '../theme';

const steps = [
  { h: 'Conversation', p: 'Session transcript, sent by the hook' },
  { h: 'Redact', p: 'API keys, JWTs, PEM blocks, seed phrases stripped' },
  { h: 'Extract', p: 'One LLM call → atomic candidate memories' },
  { h: 'Reconcile', p: 'ADD · DUPLICATE · SUPERSEDE · CONTRADICT' },
  { h: 'Write', p: 'FalkorDB graph with provenance edges' },
];
const W = 300, GAP = 50, X0 = (1920 - (steps.length * W + (steps.length - 1) * GAP)) / 2;

const Chip: React.FC<{ badge: string; text: string; sup?: boolean }> = ({ badge, text, sup }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, padding: '18px 26px', borderRadius: 16, background: '#fff', border: `2px solid ${sup ? C.border : C.accent}`, fontSize: 28, fontWeight: 500, color: sup ? '#9a9a9a' : C.text, textDecoration: sup ? 'line-through' : 'none' }}>
    <span style={{ fontFamily: F.mono, fontSize: 16, fontWeight: 600, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 8, background: sup ? '#EDEDED' : C.cream2, color: sup ? '#888' : C.deep, textDecoration: 'none' }}>{badge}</span>
    {text}
  </div>
);

export const Pipeline: React.FC = () => {
  const t = useT();
  // a pulse travels across the five stages in step with the narration
  const active = interpolate(t, [2.4, 9.0], [0, 4.99], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bar = ease(t, 2.4, 6.6);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans, color: C.text }}>
      <Rise at={0} style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', fontFamily: F.serif, fontSize: 64, fontWeight: 500 }}>From conversation to memory</Rise>
      <Rise at={0.3} style={{ position: 'absolute', top: 190, width: '100%', textAlign: 'center', fontFamily: F.mono, fontSize: 20, color: C.muted }}>engram daemon · write path</Rise>
      <div style={{ position: 'absolute', left: X0 + W / 2, top: 418, height: 4, width: (steps.length - 1) * (W + GAP), background: C.border }} />
      <div style={{ position: 'absolute', left: X0 + W / 2, top: 418, height: 4, width: (steps.length - 1) * (W + GAP) * bar, background: C.accent }} />
      {steps.map((s, i) => {
        const on = t >= 2.4 && Math.floor(active) >= i;
        const current = t >= 2.4 && Math.floor(active) === i && t < 9.0;
        return (
          <Rise key={s.h} at={0.4 + i * 0.2} style={{ position: 'absolute', left: X0 + i * (W + GAP), top: 330, width: W, height: 180, borderRadius: 18, padding: 26, background: on ? C.cream : '#fff', border: `2px solid ${on ? C.accent : C.border}`, boxShadow: current ? '0 14px 40px rgba(250,82,15,.25)' : '0 6px 18px rgba(0,0,0,.04)', transform: current ? 'scale(1.04)' : undefined }}>
            <div style={{ fontFamily: F.mono, fontSize: 15, color: on ? C.accent : C.muted, marginBottom: 6 }}>0{i + 1}</div>
            <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>{s.h}</div>
            <div style={{ fontSize: 18, color: C.muted, lineHeight: 1.4 }}>{s.p}</div>
          </Rise>
        );
      })}
      <div style={{ position: 'absolute', top: 620, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 28, alignItems: 'center' }}>
        <Rise at={9.6}><Chip badge="decision" text="Relayer uses Hono" /></Rise>
        <Rise at={10.4}><div style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 600, color: C.accent }}>── SUPERSEDES ──▶</div></Rise>
        <Rise at={10.0}><Chip badge="superseded" text="Relayer uses Express" sup /></Rise>
      </div>
      <div style={{ position: 'absolute', top: 760, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 60, alignItems: 'center' }}>
        <Rise at={10.8}><Chip badge="preference" text="Always use pnpm in this repo" /></Rise>
        <Rise at={11.6} style={{ fontFamily: F.mono, fontSize: 19, color: C.muted, lineHeight: 1.5 }}>reason: “switched for built-in validators<br />and smaller footprint”</Rise>
      </div>
    </AbsoluteFill>
  );
};
