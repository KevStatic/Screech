import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { CANDLE_CAPACITY } from '../../logic/candle-split';
import { useMotion } from '../hooks/useMotion';

export interface CandleCircleProps {
  /** Lit candles in check-in order. Only the first CANDLE_CAPACITY are drawn. */
  readonly candles: readonly { readonly name: string }[];
  /**
   * Force a still flame (Exorcise on or prefers-reduced-motion). When omitted the
   * component reads the same setting as the other screens through useMotion.
   */
  readonly reducedMotion?: boolean;
  /** Shown in the middle of the circle (for example the sigil or Soul_Count). */
  readonly children?: ReactNode;
}

/** Free places are drawn up to the next of these sizes, so the ring stays readable. */
export const CIRCLE_TIERS: readonly number[] = [12, 24, 48, CANDLE_CAPACITY];

/** Number of places on the circle for a given count of lit candles. */
export function circleSlots(lit: number): number {
  const n = Math.max(0, Math.min(CANDLE_CAPACITY, Math.floor(lit)));
  for (const tier of CIRCLE_TIERS) {
    if (n <= tier) return tier;
  }
  return CANDLE_CAPACITY;
}

const RADIUS_PCT = 41;

/**
 * The Candle_Circle: one lit candle per check-in with the name under it, and unlit
 * candles for the free places. Names are React text nodes, never markup. The flame
 * flickers slowly (under 1 Hz) only while motion is allowed.
 */
export default function CandleCircle({
  candles,
  reducedMotion,
  children,
}: CandleCircleProps): ReactElement {
  const motion = useMotion();
  const still = reducedMotion ?? motion.reduced;
  const lit = candles.slice(0, CANDLE_CAPACITY);
  const slots = circleSlots(lit.length);
  const pitch = (2 * Math.PI * RADIUS_PCT) / slots;
  const style = {
    '--candle-w': `${Math.min(9, pitch * 0.55).toFixed(2)}cqw`,
    '--candle-label-w': `${Math.min(18, pitch * 1.7).toFixed(2)}cqw`,
    '--candle-label-fs': `${Math.max(2.2, Math.min(5.2, pitch * 0.9)).toFixed(2)}cqw`,
  } as CSSProperties;

  const items: ReactElement[] = [];
  for (let i = 0; i < slots; i += 1) {
    const angle = ((-90 + (i * 360) / slots) * Math.PI) / 180;
    const x = 50 + RADIUS_PCT * Math.cos(angle);
    const y = 50 + RADIUS_PCT * Math.sin(angle);
    const entry = lit[i];
    const isLit = entry !== undefined;
    items.push(
      <li
        key={i}
        className={`seance-candle${isLit ? ' is-lit' : ' is-unlit'}`}
        data-testid={isLit ? 'candle-lit' : 'candle-unlit'}
        style={{ left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` }}
      >
        {isLit ? (
          <svg
            className={`seance-flame${still ? ' is-still' : ' is-flickering'}`}
            data-testid="seance-flame"
            viewBox="0 0 26 36"
            aria-hidden="true"
          >
            <path d="M13 1C17 9 23 14 23 22a10 10 0 0 1-20 0C3 15 9 10 13 1z" fill="#ffb347" />
            <path d="M13 13c2 4 5 6 5 10a5 5 0 0 1-10 0c0-3 3-6 5-10z" fill="#fff1c9" />
          </svg>
        ) : (
          <span className="seance-flame-gap" aria-hidden="true" />
        )}
        <span className="seance-wick" aria-hidden="true" />
        <span className="seance-wax" aria-hidden="true" />
        <span className="seance-candle-name">{isLit ? entry.name : <span aria-hidden="true">·</span>}</span>
      </li>,
    );
  }

  return (
    <div className="seance-circle" style={style} data-still={still ? 'true' : 'false'}>
      <span className="seance-ring" aria-hidden="true" />
      <span className="seance-ring is-inner" aria-hidden="true" />
      {children !== undefined ? <div className="seance-circle-center">{children}</div> : null}
      <ul className="seance-candles" aria-label="Candles lit">
        {items}
      </ul>
    </div>
  );
}
