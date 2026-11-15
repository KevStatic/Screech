import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { PlaybackHandle } from '../../audio/transmit';
import { formatDuration, percent, progress, remainingSeconds } from '../../logic/progress';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import Oscilloscope from '../components/Oscilloscope';
import type { FlowApi } from '../hooks/useFlow';
import { useMotion } from '../hooks/useMotion';
import type { TransmissionOutcome } from './Speak';

export const MSG_TRAVELLING = 'The sound is still travelling. Keep the phones close until it ends.';
export const MSG_CROSSED_OVER = 'The sound has crossed over.';
export const MSG_NOT_LEFT = 'The sound did not leave the speaker.';
export const LABEL_CANCEL = 'Cancel';
export const LABEL_RETURN = 'Back to Speak';

export interface ScreechingProps {
  readonly flow: Pick<FlowApi, 'dispatch'>;
  /**
   * What Speak handed over. The screen is only shown after playWaveform was requested on a
   * running context, or after the engine failed (then `ok` is false and the error state shows).
   */
  readonly outcome: TransmissionOutcome;
}

type Phase = 'playing' | 'ended' | 'failed';

/** Reduced motion refreshes the text once per second. */
const SLOW_TICK_MS = 1000;

interface ShellProps {
  readonly title: string;
  readonly children: ReactNode;
}

function Shell({ title, children }: ShellProps): ReactElement {
  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="screeching-title">
        <div className="row">
          <span className="label grow">Screen: Screeching</span>
          <ExorciseToggle />
        </div>
        <h1 id="screeching-title" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          {title}
        </h1>
        {children}
      </main>
    </CrtFrame>
  );
}

interface FailureProps {
  readonly detail: string | null;
  readonly onReturn: () => void;
}

function Failure({ detail, onReturn }: FailureProps): ReactElement {
  return (
    <Shell title="THE SIGNAL DIED">
      <p className="note is-error" role="alert" data-testid="screeching-failed">
        {MSG_NOT_LEFT}
      </p>
      {detail !== null ? <p className="muted">{detail}</p> : null}
      <div className="col" style={{ marginTop: 'auto' }}>
        <button type="button" className="btn hit" data-testid="screeching-return" onClick={onReturn}>
          {LABEL_RETURN}
        </button>
      </div>
    </Shell>
  );
}

interface PlaybackProps {
  readonly handle: PlaybackHandle;
  readonly wave: Float32Array;
  readonly sampleRate: number;
  readonly onLeave: () => void;
}

function Playback({ handle, wave, sampleRate, onLeave }: PlaybackProps): ReactElement {
  const { reduced } = useMotion();
  const [phase, setPhase] = useState<Phase>('playing');
  const [elapsed, setElapsed] = useState<number>(() => handle.elapsedSec());
  const leftRef = useRef(false);
  const duration = handle.durationSec;
  const readElapsed = useCallback((): number => handle.elapsedSec(), [handle]);

  // The only source of the end state is the real playback outcome.
  useEffect(() => {
    let live = true;
    void handle.finished.then((result) => {
      if (!live) return;
      if (result === 'ended') {
        setElapsed(duration);
        setPhase('ended');
      } else if (result === 'failed') {
        setPhase('failed');
      }
      // 'stopped' comes from the cancel control, which has already left the screen.
    });
    return () => {
      live = false;
    };
  }, [handle, duration]);

  // Progress text comes from the audio clock: every frame, or once per second when reduced.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    setElapsed(readElapsed());
    if (reduced) {
      const id = window.setInterval(() => setElapsed(readElapsed()), SLOW_TICK_MS);
      return () => window.clearInterval(id);
    }
    let frame = 0;
    const tick = (): void => {
      setElapsed(readElapsed());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced, readElapsed]);

  const cancel = (): void => {
    if (leftRef.current) return;
    leftRef.current = true;
    handle.stop();
    onLeave();
  };
  const back = (): void => {
    if (leftRef.current) return;
    leftRef.current = true;
    onLeave();
  };

  if (phase === 'failed') {
    return <Failure detail={null} onReturn={back} />;
  }

  const done = phase === 'ended';
  const p = done ? 1 : progress(elapsed, duration);
  const pct = percent(p);
  const left = done ? 0 : remainingSeconds(elapsed, duration);

  return (
    <Shell title={done ? 'CROSSED OVER' : 'POSSESSING THE AIR'}>
      <figure style={{ margin: 0 }} className="col">
        <Oscilloscope wave={wave} sampleRate={sampleRate} elapsedSec={readElapsed} reducedMotion={reduced} />
        <figcaption className="muted">OSCILLOSCOPE · OUTGOING</figcaption>
      </figure>

      <div className="col">
        <div style={{ position: 'relative', height: 34 }}>
          <div
            className="meter"
            role="progressbar"
            aria-label="Transmission progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            style={{ position: 'absolute', left: 0, right: 0, top: 15, height: 4 }}
          >
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="#e9e4d4"
            style={{ position: 'absolute', top: 0, left: `calc((100% - 34px) * ${p})` }}
          >
            <path d="M12 2a8 8 0 0 0-8 8v11l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2L20 21V10a8 8 0 0 0-8-8z" />
            <circle cx="9" cy="10" r="1.4" fill="#050806" />
            <circle cx="15" cy="10" r="1.4" fill="#050806" />
          </svg>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span data-testid="screeching-percent">{pct}%</span>
          <span data-testid="screeching-duration">{formatDuration(duration)} s total</span>
          <span data-testid="screeching-remaining">{left} s left</span>
        </div>
      </div>

      {done ? (
        <p className="note" role="status" data-testid="screeching-done">
          {MSG_CROSSED_OVER}
        </p>
      ) : (
        <p className="note" data-testid="screeching-travelling">
          {MSG_TRAVELLING}
        </p>
      )}

      <div className="col" style={{ marginTop: 'auto' }}>
        {done ? (
          <button type="button" className="btn hit" data-testid="screeching-return" onClick={back}>
            {LABEL_RETURN}
          </button>
        ) : (
          <button type="button" className="btn secondary hit" data-testid="screeching-cancel" onClick={cancel}>
            {LABEL_CANCEL}
          </button>
        )}
      </div>
    </Shell>
  );
}

/**
 * Screen 3: the sound is leaving the speaker. Every number here comes from the playback clock.
 * It never reads or writes the draft, so the message is kept when the user returns to Speak.
 */
export default function Screeching({ flow, outcome }: ScreechingProps): ReactElement {
  const { dispatch } = flow;
  const leave = useCallback((): void => dispatch({ type: 'transmitEnded' }), [dispatch]);

  if (!outcome.ok) {
    return <Failure detail={outcome.message} onReturn={leave} />;
  }
  return (
    <Playback handle={outcome.handle} wave={outcome.wave} sampleRate={outcome.sampleRate} onLeave={leave} />
  );
}
