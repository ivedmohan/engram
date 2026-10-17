import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadNewsreader } from '@remotion/google-fonts/Newsreader';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Same palette as the Engram web UI (src/web/index.html), so the video and product look like one thing.
export const C = {
  bg: '#FFFDF6', cream: '#FFF8E0', cream2: '#FFF0C2', text: '#1F1F1F', muted: '#6A6A6A',
  accent: '#FA520F', deep: '#CC3A05', border: '#E5E5E5', term: '#1C1B19', termText: '#EDE9E0',
};
export const F = {
  sans: loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily,
  serif: loadNewsreader('normal', { weights: ['500', '600'], subsets: ['latin'] }).fontFamily,
  mono: loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily,
};

/** Seconds of silence before each scene's narration starts, and after it ends. */
export const LEAD = 0.4;
export const TAIL = 0.8;
export const FPS = 30;
export const TRANSITION = 14;

export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps - LEAD;
};

export const ease = (t: number, from: number, dur: number) =>
  interpolate(t, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });

/** Spring-in from below, starting at `at` seconds (narration-relative). */
export const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; dy?: number }> = ({ at, children, style, dy = 24 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - Math.round((at + LEAD) * fps), fps, config: { damping: 200 }, durationInFrames: 22 });
  return <div style={{ ...style, opacity: p, transform: `${style?.transform ?? ''} translateY(${(1 - p) * dy}px)` }}>{children}</div>;
};

export const typed = (s: string, t: number, start: number, cps: number) => s.slice(0, Math.max(0, Math.floor((t - start) * cps)));

export const Caret: React.FC<{ t: number }> = ({ t }) => (
  <span style={{ display: 'inline-block', width: 12, height: 26, background: C.termText, verticalAlign: -5, opacity: Math.floor(t * 2) % 2 ? 1 : 0 }} />
);

export const Terminal: React.FC<{ title: string; children: React.ReactNode; fontSize?: number }> = ({ title, children, fontSize = 24 }) => (
  <div style={{ position: 'absolute', left: 190, top: 80, width: 1540, height: 920, background: C.term, borderRadius: 18, boxShadow: '0 40px 100px rgba(0,0,0,.28)', overflow: 'hidden', color: C.termText }}>
    <div style={{ height: 52, background: '#2A2926', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 10, fontFamily: F.mono, fontSize: 17, color: '#9a968c' }}>
      {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 15, height: 15, borderRadius: 99, background: c }} />)}
      <span style={{ marginLeft: 16 }}>{title}</span>
    </div>
    <div style={{ padding: '34px 40px', fontFamily: F.mono, fontSize, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{children}</div>
  </div>
);

export const Logo: React.FC<{ size: number; inverted?: boolean }> = ({ size, inverted }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.25, background: inverted ? '#fff' : C.accent, color: inverted ? C.accent : '#fff', display: 'grid', placeItems: 'center', fontFamily: F.serif, fontWeight: 600, fontSize: size * 0.6 }}>E</div>
);
