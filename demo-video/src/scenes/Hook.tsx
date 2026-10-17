import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, F, Logo, Rise, ease, useT } from '../theme';

const tools = [
  { name: 'Claude Code', dot: '#D97757', x: 230, quip: '"switched to Hono"', quipAt: 4.2 },
  { name: 'Cursor', dot: '#3B82F6', x: 810, quip: 'relayer uses… ?', quipAt: 6.6 },
  { name: 'Gemini CLI', dot: '#8B5CF6', x: 1390, quip: 'never heard of it', quipAt: 8.4 },
];

export const Hook: React.FC = () => {
  const t = useT();
  const join = ease(t, 12.0, 0.8);
  const quipOut = 1 - ease(t, 11.4, 0.6);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans, color: C.text }}>
      <Rise at={0.1} style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center', fontFamily: F.serif, fontSize: 78, fontWeight: 500 }}>
        Every AI coding tool starts from <span style={{ color: C.accent }}>zero.</span>
      </Rise>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {tools.map((tool, i) => {
          const p = ease(t, 12.4 + i * 0.25, 1.1);
          const sx = tool.x + 150;
          return (
            <path key={tool.name} d={`M${sx} 552 C ${sx} 700, 960 680, 960 790`} stroke={C.accent} strokeWidth={4} fill="none"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
          );
        })}
      </svg>
      {tools.map((tool, i) => (
        <React.Fragment key={tool.name}>
          <Rise at={1.2 + i * 0.3} style={{ position: 'absolute', left: tool.x, top: 440, width: 300, height: 112, background: '#fff', border: `2px solid ${C.border}`, borderRadius: 18, display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px', fontSize: 28, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.06)' }}>
            <span style={{ width: 18, height: 18, borderRadius: 99, background: tool.dot }} />{tool.name}
          </Rise>
          <div style={{ position: 'absolute', left: tool.x, width: 300, top: 580, textAlign: 'center', opacity: quipOut }}>
            <Rise at={tool.quipAt} style={{ fontFamily: F.mono, fontSize: 21, color: C.muted }}>{tool.quip}</Rise>
          </div>
        </React.Fragment>
      ))}
      <div style={{ position: 'absolute', left: 750, top: 790, width: 420, height: 124, borderRadius: 24, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: F.serif, fontWeight: 600, fontSize: 48, boxShadow: '0 20px 50px rgba(250,82,15,.35)', opacity: join, transform: `scale(${0.85 + 0.15 * join})` }}>
        <Logo size={60} inverted />Engram
      </div>
      <Rise at={14.6} style={{ position: 'absolute', top: 950, width: '100%', textAlign: 'center', fontFamily: F.mono, fontSize: 22, color: C.muted }}>
        one memory graph · every tool reads and writes it
      </Rise>
    </AbsoluteFill>
  );
};
