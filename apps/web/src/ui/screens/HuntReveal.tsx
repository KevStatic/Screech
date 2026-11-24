import { useEffect, useRef, useState, type ReactElement } from 'react';
import { unlockAudio as defaultUnlockAudio } from '../../audio/session';
import type { UnlockOutcome } from '../../audio/session';
import { emptyFoundState } from '../../logic/hunt-found';
import type { FoundState } from '../../logic/hunt-found';
import type { ProgressStore } from '../../logic/hunt-progress';
import CrtFrame from '../components/CrtFrame';
import OuijaBoard from '../components/OuijaBoard';
import SpiritCounter from '../components/SpiritCounter';
import ToggleCluster from '../components/ToggleCluster';
import type { FlowApi } from '../hooks/useFlow';
import { queueListenStart } from '../hooks/listen-handoff';
import { getProgressStore } from '../hooks/progress-store';
import { useSpelling } from '../hooks/useSpelling';

export const LABEL_SKIP = 'Skip the spelling';
export const LABEL_BACK_LISTEN = 'Back to Listen';
export const LABEL_BACK_SPEAK = 'Back to Speak';
export const LABEL_CLEAR = 'Clear this hunt';
export const LABEL_CLEAR_CONFIRM = 'Clear it';
export const LABEL_CLEAR_CANCEL = 'Keep it';
export const FOLLOW_LINE = 'Follow the K-II meter. More lights, closer spirit.';
export const NOTE_NOT_SAVED = 'Progress will be lost when this page closes.';
export const NOTE_CLEAR_FAILED = 'The saved progress could not be cleared.';
export const NOTE_CLEARED = 'Progress for this hunt was cleared.';

export interface HuntRevealProps {
  readonly flow: Pick<FlowApi, 'state' | 'dispatch'>;
  /** Defaults to the shared app store. */
  readonly store?: ProgressStore;
  /** Defaults to the real unlockAudio. Must be called first inside the tap handler. */
  readonly unlockAudio?: () => Promise<UnlockOutcome>;
}

type ClearStep = 'idle' | 'confirm' | 'cleared' | 'failed';

/** Screen for a new Spirit found: name, spelled clue, then the counter. Plays no sound. */
export default function HuntReveal({
  flow,
  store,
  unlockAudio = defaultUnlockAudio,
}: HuntRevealProps): ReactElement | null {
  const { state, dispatch } = flow;
  const intake = state.hunt !== null && state.hunt.kind === 'new' ? state.hunt : null;
  const fields = intake?.fields ?? null;
  const spelling = useSpelling(fields?.clue ?? '');
  const [clearStep, setClearStep] = useState<ClearStep>('idle');
  const doneSent = useRef(false);
  const cleared = clearStep === 'cleared' || clearStep === 'failed';

  const finished = spelling.finished;
  const completedAt = intake?.state.completedAt ?? null;
  useEffect(() => {
    if (!finished || doneSent.current || cleared || completedAt === null) return;
    doneSent.current = true;
    dispatch({ type: 'huntRevealDone' });
  }, [finished, cleared, completedAt, dispatch]);

  if (intake === null || fields === null) return null;

  const counterState: FoundState = cleared ? emptyFoundState(fields) : intake.state;
  const foundCount = intake.state.found.length;

  const backToListen = (): void => {
    // First statement, nothing awaited before it: this is the user activation.
    const unlocking = unlockAudio();
    queueListenStart(unlocking);
    dispatch({ type: 'huntBack', target: 'listen' });
  };

  const confirmClear = (): void => {
    const store0 = store ?? getProgressStore();
    let ok = false;
    try {
      ok = store0.clear(fields.huntId).cleared;
    } catch {
      ok = false;
    }
    setClearStep(ok ? 'cleared' : 'failed');
  };

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="hunt-reveal-title">
        <div className="row">
          <span className="label grow">Screen: Ghost Hunt</span>
          <ToggleCluster />
        </div>
        <h1 id="hunt-reveal-title" className="glow" style={{ margin: 0, fontWeight: 400, overflowWrap: 'anywhere' }}>
          {fields.name}
        </h1>
        <p className="label" data-testid="hunt-reveal-position">
          {`Spirit ${fields.index} of ${fields.total}`}
        </p>
        {/* Full clue for assistive technology from the first frame. Never changes while spelling. */}
        <p className="sr-only" data-testid="hunt-reveal-full-text">
          {fields.clue}
        </p>
        <OuijaBoard value={fields.clue} elapsedMs={spelling.elapsedMs} />
        {!finished ? (
          <button
            type="button"
            className="btn secondary hit"
            data-testid="hunt-reveal-skip"
            onClick={spelling.skip}
          >
            {LABEL_SKIP}
          </button>
        ) : null}
        {finished ? (
          <>
            <SpiritCounter state={counterState} />
            <p className="muted" data-testid="hunt-follow-line" style={{ margin: 0 }}>
              {FOLLOW_LINE}
            </p>
          </>
        ) : null}
        {!intake.persisted && clearStep === 'idle' ? (
          <p className="hunt-message" role="status" data-testid="hunt-not-saved">
            {NOTE_NOT_SAVED}
          </p>
        ) : null}
        {clearStep === 'cleared' ? (
          <p className="hunt-message" role="status" data-testid="hunt-cleared">
            {NOTE_CLEARED}
          </p>
        ) : null}
        {clearStep === 'failed' ? (
          <p className="hunt-message is-error" role="alert" data-testid="hunt-clear-failed">
            {NOTE_CLEAR_FAILED}
          </p>
        ) : null}
        {clearStep === 'confirm' ? (
          <div className="panel col" role="group" aria-label="Clear this hunt" data-testid="hunt-clear-confirm">
            <p className="hunt-message">
              {`Clear Hunt ${fields.huntId}? ${foundCount} found ${foundCount === 1 ? 'Spirit' : 'Spirits'} will be lost.`}
            </p>
            <button type="button" className="btn hit" data-testid="hunt-clear-yes" onClick={confirmClear}>
              {LABEL_CLEAR_CONFIRM}
            </button>
            <button
              type="button"
              className="btn secondary hit"
              data-testid="hunt-clear-no"
              onClick={() => setClearStep('idle')}
            >
              {LABEL_CLEAR_CANCEL}
            </button>
          </div>
        ) : null}
        {clearStep === 'idle' || clearStep === 'cleared' ? (
          <button
            type="button"
            className="btn secondary hit"
            data-testid="hunt-clear"
            onClick={() => setClearStep('confirm')}
          >
            {LABEL_CLEAR}
          </button>
        ) : null}
        <div className="col" style={{ marginTop: 'auto' }}>
          <button type="button" className="btn hit" data-testid="hunt-reveal-back-listen" onClick={backToListen}>
            {LABEL_BACK_LISTEN}
          </button>
          <button
            type="button"
            className="btn secondary hit"
            data-testid="hunt-reveal-back-speak"
            onClick={() => dispatch({ type: 'huntBack', target: 'speak' })}
          >
            {LABEL_BACK_SPEAK}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
