import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { Payload } from '@screech/core';
import { scrapePlan } from '../../logic/haunt-rules';
import { scrapeSeed } from '../../logic/haunt-synth';
import { spellShown } from '../../logic/ouija';
import { useHaunt } from '../hooks/useHaunt';
import type { FlowApi } from '../hooks/useFlow';
import { useMotion } from '../hooks/useMotion';
import ActionCard from '../components/ActionCard';
import CrtFrame from '../components/CrtFrame';
import ToggleCluster from '../components/ToggleCluster';
import OuijaBoard from '../components/OuijaBoard';
export const LABEL_SKIP = 'Skip the spelling';
export const LABEL_BACK_LISTEN = 'Back to Listen';
export const LABEL_BACK_SPEAK = 'Back to Speak';
/** Spelling display refresh. 12 characters per second needs a step at least every 83 ms. */
const TICK_MS = 40;
const UNIT_SEPARATOR = '\u001f';
/** The decoded value as one string: what is spelled and what assistive technology reads. */
export function revealValue(payload: Payload): string {
  switch (payload.type) {
    case 'url':
      return payload.url;
    case 'wifi':
      return payload.ssid;
    case 'contact':
      return payload.text.split(UNIT_SEPARATOR).join(', ');
    case 'text':
    case 'checkin':
    case 'hunt-clue':
      return payload.text;
  }
}
export interface RevealProps {
  readonly flow: Pick<FlowApi, 'state' | 'dispatch'>;
}
/** Screen 5: the spirits spell the message, then the action card appears. */
export default function Reveal({ flow }: RevealProps): ReactElement {
  const { state, dispatch } = flow;
  const { reduced } = useMotion();
  const payload = state.received?.packet.payload ?? null;
  const value = payload === null ? '' : revealValue(payload);
  const chars = Array.from(value);
  const haunt = useHaunt();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const startedAt = useRef<number | null>(null);
  const spelled = spellShown(elapsedMs, chars);
  const finished = reduced || skipped || spelled.done;
  const shown = finished ? chars.length : spelled.shown;
  const prevShown = useRef(0);
  const whispered = useRef(false);
  useEffect(() => {
    const before = prevShown.current;
    prevShown.current = shown;
    if (reduced || skipped) return;
    for (const r of scrapePlan(chars, before, shown)) {
      haunt.play('planchette-scrape', { seed: scrapeSeed(r.letterIndex), delayMs: r.delayMs });
    }
    // chars is derived from value, which only changes with the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, reduced, skipped]);
  useEffect(() => {
    if (!finished || payload === null || whispered.current) return;
    whispered.current = true;
    haunt.play('whisper');
  }, [finished, payload, haunt]);
  useEffect(() => () => haunt.stopOneShots(), [haunt]);
  useEffect(() => {
    if (finished) return undefined;
    if (startedAt.current === null) startedAt.current = performance.now();
    const origin = startedAt.current;
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - origin);
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [finished]);
  const skip = (): void => {
    haunt.stopKind('planchette-scrape');
    setSkipped(true);
  };
  const onSkipKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      skip();
    }
  };
  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="reveal-title">
        <div className="row">
          <span className="label grow">Screen: Reveal</span>
          <ToggleCluster />
        </div>
        <h1 id="reveal-title" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          A MESSAGE CROSSED OVER
        </h1>
        {/* Full value for assistive technology from the first frame. Never changes while spelling. */}
        <p className="sr-only" data-testid="reveal-full-text">
          {value}
        </p>
        <OuijaBoard value={value} elapsedMs={finished ? Number.POSITIVE_INFINITY : elapsedMs} />
        {!finished ? (
          <button
            type="button"
            className="btn secondary hit"
            data-testid="reveal-skip"
            onClick={skip}
            onKeyDown={onSkipKey}
          >
            {LABEL_SKIP}
          </button>
        ) : null}
        {finished && payload !== null ? <ActionCard payload={payload} /> : null}
        <div className="col" style={{ marginTop: 'auto' }}>
          <button
            type="button"
            className="btn hit"
            data-testid="reveal-back-listen"
            onClick={() => dispatch({ type: 'back', target: 'listen' })}
          >
            {LABEL_BACK_LISTEN}
          </button>
          <button
            type="button"
            className="btn secondary hit"
            data-testid="reveal-back-speak"
            onClick={() => dispatch({ type: 'back', target: 'speak' })}
          >
            {LABEL_BACK_SPEAK}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
