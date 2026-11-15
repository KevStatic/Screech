/** Characters spelled per second. */
export const SPELL_RATE_CPS = 12;
/** Most characters spelled one by one; the remainder appears at once when done. */
export const SPELL_MAX_CHARS = 30;
/** After this many milliseconds the whole value is shown. */
export const SPELL_MAX_MS = 2500;

export interface Spelled {
  /** Code points to show. Equals the full length once done. */
  readonly count: number;
  readonly done: boolean;
}

/** Spelling schedule for the Reveal screen, counted in code points. */
export function spellProgress(elapsedMs: number, length: number): Spelled {
  const len = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  const elapsed = Number.isNaN(elapsedMs) ? 0 : Math.max(0, elapsedMs);

  if (len === 0 || elapsed >= SPELL_MAX_MS) {
    return { count: len, done: true };
  }

  const stepped = Math.floor((elapsed * SPELL_RATE_CPS) / 1000);
  const count = Math.min(len, SPELL_MAX_CHARS, stepped);
  if (count === len) return { count: len, done: true };
  return { count, done: false };
}
