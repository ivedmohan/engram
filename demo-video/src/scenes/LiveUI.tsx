import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, spring, Easing } from 'remotion';
import { C, F, LEAD, ease, useT } from '../theme';
import pos from '../ui-positions.json';

// Screenshots are of the live web UI at a 1440x810 CSS viewport (see ../../README.md). Everything below is
// placed in those CSS coordinates, then mapped into the browser frame.
const BX = 120, BY = 42, BAR = 50, BW = 1680, K = BW / 1440;
const toFrame = (x: number, y: number) => ({ x: BX + x * K, y: BY + BAR + y * K });

type Shot = { t: number; z: number; x: number; y: number }; // camera: zoom z, centred on CSS point (x, y)
type Ring = { from: number; to: number; x: number; y: number; w: number; h: number };
type Caption = { from: number; to: number; text: React.ReactNode };

const lerpKeys = <T extends { t: number }>(keys: T[], t: number, get: (k: T) => number) => {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const p = interpolate(t, [a.t, b.t], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return get(a) + (get(b) - get(a)) * p;
};

const Cursor: React.FC<{ x: number; y: number; scale: number }> = ({ x, y, scale }) => (
  <svg viewBox="0 0 24 24" width={34} height={34} style={{ position: 'absolute', left: x - 5, top: y - 4, transform: `scale(${scale})`, transformOrigin: '5px 4px', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.25))' }}>
    <path d="M3 2l7 19 2.6-7.4L20 11z" fill={C.text} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

const LiveUI: React.FC<{
  image: (t: number) => string;
  shots: Shot[];
  cursor: Shot[]; // z unused
  clickAt?: number;
  rings: Ring[];
  captions: Caption[];
  overlay?: (t: number) => React.ReactNode;
}> = ({ image, shots, cursor, clickAt, rings, captions, overlay }) => {
  const t = useT();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = lerpKeys(shots, t, (k) => k.z);
  const focus = toFrame(lerpKeys(shots, t, (k) => k.x), lerpKeys(shots, t, (k) => k.y));
  const cam = `translate(${960 - focus.x * z}px, ${540 - focus.y * z}px) scale(${z})`;
  const cur = toFrame(lerpKeys(cursor, t, (k) => k.x), lerpKeys(cursor, t, (k) => k.y));
  const press = clickAt !== undefined ? spring({ frame: frame - Math.round((clickAt + LEAD) * fps), fps, durationInFrames: 10 }) : 0;
  const ripple = clickAt !== undefined ? interpolate(t, [clickAt, clickAt + 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const cap = captions.find((c) => t >= c.from && t < c.to);
  const capO = cap ? Math.min(ease(t, cap.from, 0.3), 1 - ease(t, cap.to - 0.3, 0.3)) : 0;

  return (
    <AbsoluteFill style={{ background: C.cream2, fontFamily: F.sans }}>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: cam }}>
        <div style={{ position: 'absolute', left: BX, top: BY, width: BW, height: BAR + 945, borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 40px 100px rgba(0,0,0,.22)' }}>
          <div style={{ height: BAR, background: '#F3F1EA', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: `1px solid ${C.border}` }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />)}
            <div style={{ marginLeft: 24, flex: 1, maxWidth: 560, height: 30, borderRadius: 8, background: '#fff', border: `1px solid ${C.border}`, fontFamily: F.mono, fontSize: 16, color: C.muted, display: 'flex', alignItems: 'center', padding: '0 14px' }}>127.0.0.1:7777</div>
          </div>
          <Img src={staticFile(image(t))} style={{ width: BW, height: 945, display: 'block' }} />
        </div>
        {overlay?.(t)}
        {rings.map((r, i) => {
          const o = Math.min(ease(t, r.from, 0.35), 1 - ease(t, r.to - 0.3, 0.3));
          const a = toFrame(r.x, r.y);
          return <div key={i} style={{ position: 'absolute', left: a.x - 8, top: a.y - 8, width: r.w * K + 16, height: r.h * K + 16, border: `4px solid ${C.accent}`, borderRadius: 14, boxShadow: '0 0 0 8px rgba(250,82,15,.15)', opacity: o }} />;
        })}
        {clickAt !== undefined && ripple > 0 && ripple < 1 && (
          <div style={{ position: 'absolute', left: cur.x - 40, top: cur.y - 40, width: 80, height: 80, borderRadius: 99, background: 'rgba(250,82,15,.35)', opacity: 1 - ripple, transform: `scale(${0.3 + ripple})` }} />
        )}
        <Cursor x={cur.x} y={cur.y} scale={(1 / z) * (1 - 0.15 * press * (1 - ripple))} />
      </div>
      <div style={{ position: 'absolute', left: 60, bottom: 60, padding: '18px 26px', borderRadius: 14, background: C.text, color: '#fff', fontSize: 28, fontWeight: 500, opacity: capO, transform: `translateY(${(1 - capO) * 12}px)`, boxShadow: '0 12px 30px rgba(0,0,0,.25)' }}>
        {cap?.text}
      </div>
    </AbsoluteFill>
  );
};

const b = (s: string) => <b style={{ color: '#FF8A4C', fontWeight: 600 }}>{s}</b>;
const mono = (s: string) => <span style={{ fontFamily: F.mono, fontSize: 24, color: '#FF8A4C' }}>{s}</span>;

// "Supersedes 'Relayer uses Express'" callout inside the detail panel, measured from ui-hono.png.
const SUP_BOX = { x: 900, y: 242, w: 526, h: 46 };
const MID_Y = pos.hono.y;

export const GraphScene: React.FC = () => (
  <LiveUI
    image={(t) => (t < 3.05 ? 'ui-graph.png' : 'ui-hono.png')}
    clickAt={3.0}
    shots={[
      { t: 0, z: 1, x: 720, y: 405 }, { t: 5.2, z: 1, x: 720, y: 405 },
      { t: 6.8, z: 2.0, x: (pos.express.x + pos.hono.x) / 2, y: MID_Y },
      { t: 11.6, z: 2.0, x: (pos.express.x + pos.hono.x) / 2, y: MID_Y },
      { t: 13.0, z: 1.75, x: 1130, y: 230 }, { t: 30, z: 1.75, x: 1130, y: 230 },
    ]}
    cursor={[
      { t: 0, z: 1, x: 760, y: 300 }, { t: 1.2, z: 1, x: 760, y: 300 },
      { t: 2.8, z: 1, x: pos.hono.x, y: pos.hono.y }, { t: 11.8, z: 1, x: pos.hono.x, y: pos.hono.y },
      { t: 13.2, z: 1, x: 1180, y: 268 }, { t: 30, z: 1, x: 1180, y: 268 },
    ]}
    rings={[{ from: 13.2, to: 40, ...SUP_BOX }]}
    captions={[
      { from: 0.3, to: 4.8, text: <>Live web UI · {b('FalkorDB')} graph for {b('demo-relayer')}</> },
      { from: 7.0, to: 12.6, text: mono('(:Memory)-[:SUPERSEDES {at, reason}]->(:Memory)') },
      { from: 13.2, to: 30, text: <>Old decision kept for history · recall serves the {b('current')} one</> },
    ]}
    overlay={(t) => {
      // re-draw the SUPERSEDES edge thicker, growing from Hono back to Express, to call it out
      const p = ease(t, 7.0, 1.1);
      const o = 1 - ease(t, 12.2, 0.6);
      const a = toFrame(pos.hono.x - 40, MID_Y), e = toFrame(pos.express.x + 44, MID_Y);
      const x = a.x + (e.x - a.x) * p;
      const lbl = ease(t, 8.0, 0.4) * o;
      return (
        <>
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: o }}>
            <line x1={a.x} y1={a.y} x2={x} y2={a.y} stroke={C.accent} strokeWidth={7} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(250,82,15,.6))' }} />
            {p > 0.98 && <polygon points={`${e.x},${e.y} ${e.x + 16},${e.y - 10} ${e.x + 16},${e.y + 10}`} fill={C.accent} />}
          </svg>
          <div style={{ position: 'absolute', left: (a.x + e.x) / 2 - 250, top: a.y - 62, width: 500, whiteSpace: 'nowrap', textAlign: 'center', opacity: lbl }}>
            <span style={{ display: 'inline-block', background: C.accent, color: '#fff', fontFamily: F.mono, fontWeight: 600, fontSize: 15, padding: '6px 12px', borderRadius: 8 }}>SUPERSEDES · "built-in validators"</span>
          </div>
        </>
      );
    }}
  />
);

// Timeline list and project picker, measured from ui-hono.png.
const TIMELINE = { x: 900, y: 345, w: 526, h: 136 };
const PICKER = pos.picker;

export const TimelineScene: React.FC = () => (
  <LiveUI
    image={() => 'ui-hono.png'}
    shots={[
      { t: 0, z: 1.75, x: 1130, y: 230 }, { t: 0.4, z: 1.75, x: 1130, y: 230 },
      { t: 1.8, z: 1.8, x: 1140, y: 400 }, { t: 5.4, z: 1.8, x: 1140, y: 400 },
      { t: 6.8, z: 1.7, x: 420, y: 220 }, { t: 30, z: 1.7, x: 420, y: 220 },
    ]}
    cursor={[
      { t: 0, z: 1, x: 1180, y: 268 }, { t: 0.6, z: 1, x: 1180, y: 268 },
      { t: 1.8, z: 1, x: 1080, y: 368 }, { t: 4.8, z: 1, x: 1080, y: 462 },
      { t: 6.6, z: 1, x: PICKER.x + 150, y: PICKER.y + 20 }, { t: 30, z: 1, x: PICKER.x + 150, y: PICKER.y + 20 },
    ]}
    rings={[{ from: 1.6, to: 5.6, ...TIMELINE }, { from: 6.6, to: 40, x: PICKER.x, y: PICKER.y, w: PICKER.w, h: PICKER.h }]}
    captions={[
      { from: 0.5, to: 5.6, text: <>Provenance: {b('tool → session → memory')}, in order</> },
      { from: 6.0, to: 30, text: <>One graph per project {mono('engram_p_<slug>')} + one {mono('engram_global')}</> },
    ]}
  />
);
