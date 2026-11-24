/** Beacon timing helpers. Pure functions, no clock or random source. */

export const BEACON_MIN_MS = 15000;
export const BEACON_MAX_MS = 20000;

/**
 * Milliseconds until the next screech for a random value in [0, 1).
 * Any other input (NaN, Infinity, negative, 1 or more, non-number) gives BEACON_MIN_MS.
 */
export function beaconInterval(random: number): number {
  if (typeof random !== 'number' || !Number.isFinite(random) || random < 0 || random >= 1) {
    return BEACON_MIN_MS;
  }
  const value = Math.floor(BEACON_MIN_MS + random * 5001);
  return Math.min(value, BEACON_MAX_MS);
}

/** Whole seconds until `nextAtMs`, rounded up and clamped to 0..20. 0 for non-finite input. */
export function countdownSeconds(nextAtMs: number, nowMs: number): number {
  if (!Number.isFinite(nextAtMs) || !Number.isFinite(nowMs)) return 0;
  const seconds = Math.ceil((nextAtMs - nowMs) / 1000);
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(20, Math.max(0, seconds));
}
