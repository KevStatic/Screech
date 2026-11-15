import { useId } from 'react';
import { HOLD_DURATION_MS } from '../../logic/hold-machine';
import type { HoldApi } from '../hooks/useHold';

export interface ScreechKeyProps {
  /** Result of useHold: fill level and the pointer and keyboard handlers. */
  readonly hold: Pick<HoldApi, 'progress' | 'handlers'>;
  readonly disabled: boolean;
}

/** The transmit control. Fires after the key is held for HOLD_DURATION_MS. */
export default function ScreechKey({ hold, disabled }: ScreechKeyProps) {
  const descId = useId();
  const progress = disabled ? 0 : Math.max(0, Math.min(1, hold.progress));
  return (
    <div className="col">
      <button
        type="button"
        className="hit screech-key"
        disabled={disabled}
        aria-describedby={descId}
        data-progress={progress}
        {...hold.handlers}
      >
        <span className="screech-key-fill" aria-hidden="true" style={{ width: `${progress * 100}%` }} />
        <span className="screech-key-label">SCREECH</span>
      </button>
      <span id={descId} className="muted">
        Hold for {HOLD_DURATION_MS} ms to transmit.
      </span>
    </div>
  );
}
