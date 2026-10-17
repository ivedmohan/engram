import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, Caret, F, Terminal, typed, useT } from '../theme';

const MSG = "Let's switch the relayer from Express to Hono, and we always use pnpm in this repo.";
const or = { color: '#FF8A4C' };
const dim = { color: '#8d897f' };
const gr = { color: '#9BD08A' };

export const ClaudeSession: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Terminal title="claude — ~/demo-relayer">
        <span style={or}>✻</span> Welcome to <b>Claude Code</b>{'\n'}
        <span style={dim}>  cwd: ~/demo-relayer · engram MCP + hooks installed</span>{'\n\n'}
        <span style={or}>&gt;</span> {typed(MSG, t, 2.2, 24)}{t < 6.0 && <Caret t={t} />}{'\n'}
        {t > 6.8 && <>{'\n'}<span style={or}>⏺</span> Got it — moving the relayer to Hono and using pnpm for installs.{'\n'}<span style={dim}>  Update(relayer/server.ts) · Update(package.json)</span>{'\n'}</>}
        {t > 9.6 && <>{'\n'}<span style={or}>&gt;</span> /exit{'\n'}</>}
        {t > 10.6 && <>{'\n'}<span style={gr}>  ⎿ SessionEnd hook</span> <span style={dim}>→ POST 127.0.0.1:7777/capture</span>{'\n'}</>}
        {t > 11.6 && <><span style={gr}>  ⎿ engram</span> <span style={dim}>transcript queued for extraction</span>{'\n'}</>}
        {t > 13.4 && <>{'\n'}<span style={{ ...or, fontFamily: F.serif, fontSize: 34, fontStyle: 'italic' }}>  no one said “remember this.”</span></>}
      </Terminal>
    </AbsoluteFill>
  );
};
