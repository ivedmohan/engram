import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, Caret, Terminal, typed, useT } from '../theme';
import recall from '../recall.json';

// Real response from the running daemon (captured with the same curl shown on screen).
const JSON_LINES = JSON.stringify(recall, null, 4).split('\n');
const CMD = `curl -s -X POST http://127.0.0.1:7777/recall \\\n    -d '{"query":"what framework does the relayer use","cwd":"/tmp/demo-relayer"}'`;
const hl = { background: 'rgba(250,82,15,.32)', borderRadius: 4 };

const Line: React.FC<{ line: string; t: number }> = ({ line, t }) => {
  const marks = ['"Relayer uses Hono"', ...(t > 8.2 ? ['"supersedes"', '"Relayer uses Express"'] : [])];
  const m = marks.find((x) => line.includes(x));
  if (!m) return <>{line}</>;
  const [a, b] = line.split(m);
  return <>{a}<span style={hl}>{m}</span>{b}</>;
};

export const Recall: React.FC = () => {
  const t = useT();
  const shown = t > 4.8 ? Math.floor((t - 4.8) * 55) : 0;
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Terminal title="another tool, same repo — engram_recall over MCP → daemon :7777" fontSize={19}>
        <span style={{ color: '#9BD08A' }}>~/demo-relayer $</span> {typed(CMD, t, 0.4, 42)}{t < 4.4 && <Caret t={t} />}{'\n'}
        {JSON_LINES.slice(0, shown).map((l, i) => <React.Fragment key={i}><Line line={l} t={t} />{'\n'}</React.Fragment>)}
      </Terminal>
    </AbsoluteFill>
  );
};
