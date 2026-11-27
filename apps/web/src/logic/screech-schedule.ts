/** Seance screech loop timing helpers. Pure functions, no clock or random source. */

export const SCREECH_MIN_MS = 10000;
export const SCREECH_MAX_MS = 15000;

/**
 * Milliseconds until the next screech for a random value in [0, 1).
 * Any other input (NaN, Infinity, negative, 1 or more, non-number) gives SCREECH_MIN_MS.
 */
export function screechInterval(random: number): number {
  if (typeof random !== 'number' || !Number.isFinite(random) || random < 0 || random >= 1) {
    return SCREECH_MIN_MS;
  }
  const value = Math.floor(SCREECH_MIN_MS + random * 5001);
  return Math.min(value, SCREECH_MAX_MS);
}
