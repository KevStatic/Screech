import type { ReactElement } from 'react';
import type { RowStatus } from '../../logic/hunt-setup';

export interface ByteCounterProps {
  /** Status of one row, from rowStatus() in logic/hunt-setup.ts. */
  status: RowStatus;
}

/** The byte cap shown as "N/140"; 140/140 is full but not an error. */
const FULL_SIZE = 140;

/**
 * Byte counter for one Spirit row. The label sits in a polite live region.
 * Errors get a visible "Error:" word as well as blood red, so colour is never
 * the only signal. The Long_Clue_Note is shown in bone white.
 */
export default function ByteCounter({ status }: ByteCounterProps): ReactElement {
  const isError = status.kind !== 'ok';
  const isFull = status.kind === 'ok' && status.size === FULL_SIZE;
  const className = ['byte-counter', isFull ? 'is-full' : '', isError ? 'is-error' : '']
    .filter(Boolean)
    .join(' ');
  const note = status.kind === 'ok' ? status.longNote : null;

  return (
    <div>
      <div className={className} role="status" aria-live="polite" aria-atomic="true">
        {isError ? <strong className="counter-error-tag">Error:</strong> : null}
        <span className="counter-label">{status.label}</span>
      </div>
      {note ? <p className="long-clue-note">{note}</p> : null}
    </div>
  );
}
