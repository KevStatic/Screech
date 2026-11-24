import { useState, type ReactElement } from 'react';
import { formatTimeTaken, timeTakenSeconds } from '../../logic/hunt-found';
import type { AudioSessionApi } from '../hooks/useAudioSession';
import type { FlowApi } from '../hooks/useFlow';
import { queueListenStart } from '../hooks/listen-handoff';
import { getProgressStore } from '../hooks/progress-store';
import CrtFrame from '../components/CrtFrame';
import SpiritCounter from '../components/SpiritCounter';
import ToggleCluster from '../components/ToggleCluster';

export const LABEL_HUNT_COMPLETE = 'Hunt complete';
export const LABEL_RETURN_SPEAK = 'Return to Speak';
export const LABEL_START_OVER = 'Start over';
export const LABEL_CONFIRM_OVER = 'Yes, start over';
export const LABEL_KEEP = 'Keep my progress';

export interface HuntCompleteProps {
  readonly flow: Pick<FlowApi, 'state' | 'dispatch'>;
  readonly audio: Pick<AudioSessionApi, 'unlockAudio'>;
}

/** Plain-words question naming the Hunt_ID and how many Spirits would be lost. */
export function startOverText(huntId: string, found: number): string {
  const spirits = found === 1 ? '1 found Spirit' : `${found} found Spirits`;
  return `Start Hunt ${huntId} over? ${spirits} will be forgotten.`;
}

/** Finish screen of a Ghost Hunt. Plays no sound and has no animation. */
export default function HuntComplete({ flow, audio }: HuntCompleteProps): ReactElement | null {
  const { state, dispatch } = flow;
  const [confirming, setConfirming] = useState(false);
  const hunt = state.hunt;
  if (hunt === null) return null;
  const found = hunt.state;

  const confirmOver = (): void => {
    // First statement: the tap gesture must reach unlockAudio before any await or state change.
    const unlocking = audio.unlockAudio();
    queueListenStart(unlocking);
    getProgressStore().clear(found.huntId);
    dispatch({ type: 'huntRestart' });
  };

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="hunt-complete-title">
        <div className="row">
          <span className="label grow">Screen: Hunt complete</span>
          <ToggleCluster />
        </div>
        <h1
          id="hunt-complete-title"
          className="glow"
          data-testid="hunt-complete-title"
          style={{ margin: 0, fontWeight: 400 }}
        >
          {LABEL_HUNT_COMPLETE}
        </h1>
        <p className="hunt-message" data-testid="hunt-complete-time">
          Time taken: {formatTimeTaken(timeTakenSeconds(found))}
        </p>
        <SpiritCounter state={found} />
        <p className="hunt-message" data-testid="hunt-complete-id">
          Hunt ID: {found.huntId}
        </p>
        <p className="hunt-message" data-testid="hunt-complete-count">
          Spirits found: {found.total} of {found.total}
        </p>
        {confirming ? (
          <div role="group" aria-label="Start the Hunt over" className="note hunt-controls">
            <p className="hunt-message" data-testid="hunt-complete-confirm-text">
              {startOverText(found.huntId, found.found.length)}
            </p>
            <button
              type="button"
              className="btn hit"
              data-testid="hunt-complete-confirm"
              onClick={confirmOver}
            >
              {LABEL_CONFIRM_OVER}
            </button>
            <button
              type="button"
              className="btn secondary hit"
              data-testid="hunt-complete-decline"
              onClick={() => setConfirming(false)}
            >
              {LABEL_KEEP}
            </button>
          </div>
        ) : null}
        <div className="col" style={{ marginTop: 'auto' }}>
          <button
            type="button"
            className="btn hit"
            data-testid="hunt-complete-speak"
            onClick={() => dispatch({ type: 'huntBack', target: 'speak' })}
          >
            {LABEL_RETURN_SPEAK}
          </button>
          {!confirming ? (
            <button
              type="button"
              className="btn secondary hit"
              data-testid="hunt-complete-start-over"
              onClick={() => setConfirming(true)}
            >
              {LABEL_START_OVER}
            </button>
          ) : null}
        </div>
      </main>
    </CrtFrame>
  );
}
