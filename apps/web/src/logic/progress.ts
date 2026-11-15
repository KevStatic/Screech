function validDuration(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0;
}

/** Elapsed seconds made safe: NaN, infinite and negative values become 0. */
function safeElapsed(elapsedSec: number): number {
  return Number.isFinite(elapsedSec) && elapsedSec > 0 ? elapsedSec : 0;
}

/** Fraction of the transmission played, always in [0, 1]. Bad input gives 0. */
export function progress(elapsedSec: number, durationSec: number): number {
  if (!validDuration(durationSec)) return 0;
  const p = safeElapsed(elapsedSec) / durationSec;
  return Math.min(1, Math.max(0, p));
}

/** Whole percent in 0..100. Non-finite input gives 0. */
export function percent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, Math.floor(p * 100)));
}

/** Whole seconds left, in 0..ceil(duration). Bad input gives 0 for duration, or the full duration for elapsed. */
export function remainingSeconds(elapsedSec: number, durationSec: number): number {
  if (!validDuration(durationSec)) return 0;
  return Math.ceil(Math.max(0, durationSec - safeElapsed(elapsedSec)));
}

/** Seconds with one decimal place. Non-finite or negative gives "0.0". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0';
  return seconds.toFixed(1);
}
