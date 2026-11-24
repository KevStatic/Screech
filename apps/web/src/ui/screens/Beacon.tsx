import { useId, type CSSProperties, type ReactElement } from 'react';
import type { ClueFields } from '@screech/core';
import type { WakeStatus } from '../../audio/wake-lock';
import { HOLD_DURATION_MS } from '../../logic/hold-machine';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import { useBeacon, QUIET_MESSAGE, type BeaconDeps } from '../hooks/useBeacon';
import { useHold } from '../hooks/useHold';
import { useMotion } from '../hooks/useMotion';

export const LABEL_START_BEACON = 'Start the beacon';
export const LABEL_STARTING = 'Starting';
export const LABEL_WAKE_TAP = 'Tap to wake the beacon';
export const TEXT_SCREECHING = 'Screeching now';
export const TEXT_WAKE_HELD = 'Screen kept awake';
export const TEXT_WAKE_RELEASED = 'The screen may lock.';
export const TEXT_WAKE_UNAVAILABLE = 'This phone may lock its screen. Turn off auto-lock.';
export const TEXT_VOLUME =
  'Turn the phone volume up. On iPhone, turn off the silent switch.';
export const TEXT_HIDE_HINT = 'Leave the screen on and hide the phone.';

export interface BeaconProps {
  /** Fields from the setup link that the clue builder already accepted. */
  readonly fields: ClueFields;
  /** Replaces audio, wake lock and clock. Tests only. */
  readonly deps?: Partial<BeaconDeps>;
}

/** Text shown for the wake lock, or null while nothing has been reported yet. */
export function wakeText(status: WakeStatus): string | null {
  switch (status) {
    case 'held':
      return TEXT_WAKE_HELD;
    case 'released':
      return TEXT_WAKE_RELEASED;
    case 'unsupported':
    case 'rejected':
      return TEXT_WAKE_UNAVAILABLE;
    case 'idle':
      return null;
  }
}

/** Screen: a phone that screeches its Spirit's clue every 15 to 20 seconds. Opens no mic. */
export default function Beacon({ fields, deps }: BeaconProps): ReactElement {
  const beacon = useBeacon(fields, deps);
  const { reduced } = useMotion();
  const holdDescId = useId();
  const running = beacon.phase === 'running';
  const hold = useHold({ disabled: !running, onFired: () => beacon.stop() });
  const progress = running ? Math.max(0, Math.min(1, hold.progress)) : 0;

  const wake = running ? wakeText(beacon.wake) : null;
  // Reduced motion: the countdown changes as text with no animation or transition.
  const statusStyle: CSSProperties | undefined = reduced
    ? { animationDuration: '0ms', transitionDuration: '0ms' }
    : undefined;
  const status = beacon.screeching
    ? TEXT_SCREECHING
    : `Next screech in ${beacon.countdownSeconds} s`;
  // A failed wake tap adds its message; the "went quiet" message stays (9.9).
  const extraError = beacon.quiet && beacon.error === QUIET_MESSAGE ? null : beacon.error;

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="beacon-title">
        <div className="row">
          <span className="label grow">Screen: Beacon</span>
          <div className="toggle-cluster">
            <ExorciseToggle />
          </div>
        </div>
        <h1 id="beacon-title" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          {`BEACON · Spirit ${fields.index} of ${fields.total}`}
        </h1>
        <p className="note" data-testid="beacon-name">
          {fields.name}
        </p>
        <p className="muted" data-testid="beacon-hunt-id">
          Hunt {fields.huntId}
        </p>

        {!running ? (
          <>
            <button
              type="button"
              className="btn hit"
              data-testid="beacon-start"
              disabled={beacon.phase === 'starting'}
              onClick={() => beacon.start()}
            >
              {beacon.phase === 'starting' ? LABEL_STARTING : LABEL_START_BEACON}
            </button>
            <p className="beacon-hint">{TEXT_HIDE_HINT}</p>
          </>
        ) : (
          <>
            <p className="beacon-clue" data-testid="beacon-clue">
              {fields.clue}
            </p>
            {beacon.quiet ? (
              <div className="panel col is-error" role="alert" data-testid="beacon-quiet">
                <p className="beacon-error">{QUIET_MESSAGE}</p>
                <button
                  type="button"
                  className="btn hit"
                  data-testid="beacon-wake-tap"
                  onClick={() => beacon.wakeTap()}
                >
                  {LABEL_WAKE_TAP}
                </button>
              </div>
            ) : (
              <div
                className="beacon-status"
                role="status"
                data-testid="beacon-status"
                style={statusStyle}
              >
                <span className="sr-only">{status}</span>
                {beacon.screeching ? (
                  <span className="beacon-screeching fx-pulse" aria-hidden="true">
                    SCREECHING
                  </span>
                ) : (
                  <span className="beacon-countdown" aria-hidden="true">
                    <span className="beacon-count">{beacon.countdownSeconds}</span>
                    <span className="beacon-count-label">next screech</span>
                  </span>
                )}
              </div>
            )}
            {wake !== null ? (
              <p className="beacon-hint" role="status" data-testid="beacon-wake">
                {wake}
              </p>
            ) : null}
            <p className="beacon-hint" data-testid="beacon-volume">
              {TEXT_VOLUME}
            </p>
            <button
              type="button"
              className="hit screech-key"
              data-testid="beacon-stop"
              aria-describedby={holdDescId}
              data-progress={progress}
              {...hold.handlers}
            >
              <span className="screech-key-fill" aria-hidden="true" style={{ width: `${progress * 100}%` }} />
              <span className="screech-key-label">STOP</span>
              <span className="screech-key-hint">hold to stop</span>
              <span id={holdDescId} className="sr-only">
                Hold for {HOLD_DURATION_MS} ms to stop the beacon. A tap does nothing.
              </span>
            </button>
          </>
        )}

        {extraError !== null ? (
          <p className="beacon-error" role="alert" data-testid="beacon-error">
            {extraError}
          </p>
        ) : null}
      </main>
    </CrtFrame>
  );
}
