import React from 'react';
import { Composition, Sequence, Audio, staticFile, AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import durations from './durations.json';
import { FPS, LEAD, TAIL, TRANSITION } from './theme';
import { Hook } from './scenes/Hook';
import { ClaudeSession } from './scenes/ClaudeSession';
import { Pipeline } from './scenes/Pipeline';
import { Recall } from './scenes/Recall';
import { GraphScene, TimelineScene } from './scenes/LiveUI';
import { Close } from './scenes/Close';

const SCENES: { id: keyof typeof durations; C: React.FC; enter: 'fade' | 'slide' }[] = [
  { id: '01_hook', C: Hook, enter: 'fade' },
  { id: '02_claude', C: ClaudeSession, enter: 'slide' },
  { id: '03_seed', C: Pipeline, enter: 'fade' },
  { id: '04_recall', C: Recall, enter: 'slide' },
  { id: '05_graph', C: GraphScene, enter: 'fade' },
  { id: '06_timeline', C: TimelineScene, enter: 'fade' },
  { id: '07_close', C: Close, enter: 'fade' },
];
const frames = (id: keyof typeof durations) => Math.ceil((LEAD + durations[id] + TAIL) * FPS);
const TOTAL = SCENES.reduce((s, x) => s + frames(x.id), 0) - TRANSITION * (SCENES.length - 1);

const EngramDemo: React.FC = () => (
  <AbsoluteFill style={{ background: '#FFFDF6' }}>
    <TransitionSeries>
      {SCENES.flatMap(({ id, C, enter }, i) => [
        ...(i > 0
          ? [<TransitionSeries.Transition key={`t${id}`} presentation={enter === 'slide' ? slide({ direction: 'from-right' }) : fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />]
          : []),
        <TransitionSeries.Sequence key={id} durationInFrames={frames(id)}>
          <C />
          <Sequence from={Math.round(LEAD * FPS)} layout="none">
            <Audio src={staticFile(`${id}.mp3`)} />
          </Sequence>
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <Composition id="EngramDemo" component={EngramDemo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
