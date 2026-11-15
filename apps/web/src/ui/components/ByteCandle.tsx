import { SIZE_CAP } from '@screech/core';
import type { Budget } from '../../logic/byte-budget';
import { useMotion } from '../hooks/useMotion';

export interface ByteCandleProps {
  readonly budget: Budget;
}

/**
 * Byte gauge. Wax height is the fill proportion. The flame is lit, and flickers,
 * only while fill is above 0 and motion is allowed.
 */
export default function ByteCandle({ budget }: ByteCandleProps) {
  const { reduced } = useMotion();
  const fill = Math.max(0, Math.min(1, budget.fill));
  const tooLarge = budget.status === 'too-large';
  const showSize = budget.size !== null && budget.status !== 'invalid';
  const lit = fill > 0;
  const flicker = lit && !reduced;

  return (
    <div className="candle">
      <div className="candle-stick" aria-hidden="true">
        {lit ? (
          <span className={`candle-flame${flicker ? ' is-flickering' : ''}`} data-testid="candle-flame" />
        ) : null}
        <span className="candle-wick" />
        <span className="candle-track">
          <span
            className={`candle-wax${tooLarge ? ' is-curse' : ''}`}
            data-testid="candle-wax"
            style={{ height: `${fill * 100}%` }}
          />
        </span>
      </div>
      <div className="col">
        {showSize ? (
          <div className={`candle-count${tooLarge ? ' is-error' : ''}`} data-testid="candle-count">
            {budget.size}/{SIZE_CAP} bytes
          </div>
        ) : null}
        {tooLarge && budget.message !== null ? (
          <p className="note is-error" role="alert">
            {budget.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
