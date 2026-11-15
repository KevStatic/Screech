import type { ReactNode } from 'react';
import { SIZE_CAP } from '@screech/core';
import type { Budget } from '../../logic/byte-budget';
import { useMotion } from '../hooks/useMotion';
export interface ByteCandleProps {
  readonly budget: Budget;
  /** Extra controls shown beside the candle, under the byte count. */
  readonly children?: ReactNode;
}
/** Wax height in px when no bytes are used. */
export const WAX_MAX_PX = 112;
/**
 * Byte gauge. The candle burns down as bytes are used: wax height is 1 - fill, so it is
 * full when empty and gone when the message is too heavy. The flame sits on the wick and
 * is lit until the message is too heavy. It flickers only when motion is allowed.
 */
export default function ByteCandle({ budget, children }: ByteCandleProps) {
  const { reduced } = useMotion();
  const fill = Math.max(0, Math.min(1, budget.fill));
  const tooLarge = budget.status === 'too-large';
  const showSize = budget.size !== null && budget.status !== 'invalid';
  const lit = !tooLarge;
  const flicker = lit && !reduced;
  return (
    <div className="candle">
      <div className="candle-stick" aria-hidden="true">
        {lit ? (
          <svg
            className={`candle-flame${flicker ? ' is-flickering' : ''}`}
            data-testid="candle-flame"
            width="26"
            height="36"
            viewBox="0 0 26 36"
          >
            <path d="M13 1C17 9 23 14 23 22a10 10 0 0 1-20 0C3 15 9 10 13 1z" fill="#ffb347" />
            <path d="M13 13c2 4 5 6 5 10a5 5 0 0 1-10 0c0-3 3-6 5-10z" fill="#fff1c9" />
          </svg>
        ) : null}
        <span className="candle-wick" />
        <span
          className={`candle-wax${tooLarge ? ' is-curse' : ''}`}
          data-testid="candle-wax"
          style={{ height: `${(1 - fill) * WAX_MAX_PX}px` }}
        />
      </div>
      <div className="candle-side">
        {showSize ? (
          <div className={`candle-count${tooLarge ? ' is-error' : ''}`} data-testid="candle-count">
            <span className="candle-total">{budget.size}</span>
            <span className="candle-cap">/{SIZE_CAP} bytes</span>
          </div>
        ) : null}
        {tooLarge && budget.message !== null ? (
          <p className="note is-error" role="alert">
            {budget.message}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
