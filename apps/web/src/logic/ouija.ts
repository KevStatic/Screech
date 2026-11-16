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

export interface SpelledText {
  /** Code points of the text to show. */
  readonly shown: number;
  /** Letters (non-whitespace code points) within the first `shown` code points. */
  readonly letters: number;
  readonly done: boolean;
}

/** A Letter is any code point that is not whitespace. */
export function isLetter(ch: string): boolean {
  return !/^\s*$/u.test(ch);
}

/**
 * Spelling of a text, stepping one Letter at a time. Whitespace never
 * consumes a step. `chars` is the text split into code points.
 */
export function spellShown(elapsedMs: number, chars: readonly string[]): SpelledText {
  let total = 0;
  for (const ch of chars) if (isLetter(ch)) total += 1;

  const { count, done } = spellProgress(elapsedMs, total);
  if (done) return { shown: chars.length, letters: total, done: true };

  let shown = 0;
  let letters = 0;
  if (count > 0) {
    for (let i = 0; i < chars.length; i += 1) {
      if (isLetter(chars[i] as string)) letters += 1;
      if (letters === count) {
        shown = i + 1;
        break;
      }
    }
  }
  return { shown, letters, done: false };
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
