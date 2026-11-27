/** Number of check-ins drawn as candles on the Candle_Circle (Requirement 11.10). */
export const CANDLE_CAPACITY = 100;

export interface CandleSplit<T> {
  /** The first CANDLE_CAPACITY check-ins, drawn on the circle. */
  readonly circle: readonly T[];
  /** The remaining check-ins, shown in the scrolling list. */
  readonly overflow: readonly T[];
}

/**
 * Splits check-ins into the circle (first 100) and the scrolling list (the rest).
 * Order and count are preserved: circle followed by overflow equals the input.
 */
export function splitCandles<T>(checkIns: readonly T[]): CandleSplit<T> {
  return {
    circle: checkIns.slice(0, CANDLE_CAPACITY),
    overflow: checkIns.slice(CANDLE_CAPACITY),
  };
}
