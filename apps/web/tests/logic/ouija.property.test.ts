import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  SPELL_MAX_CHARS,
  SPELL_MAX_MS,
  SPELL_RATE_CPS,
  spellProgress,
} from '../../src/logic/ouija';

const NUM_RUNS = 200;

/** Lengths from plain integers and from code-point counts of random strings (emoji, astral). */
const lengthArb = fc.oneof(
  fc.integer({ min: 0, max: 200 }),
  fc.string({ unit: 'binary', maxLength: 120 }).map((s) => Array.from(s).length),
  fc
    .array(fc.constantFrom('a', 'é', '漢', '👻', '🕯️', '\u{1F480}', '\u{10FFFF}'), { maxLength: 80 })
    .map((parts) => Array.from(parts.join('')).length),
);

const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: 6000 }),
  fc.double({ min: 0, max: 6000, noNaN: true }),
);

describe('Feature: spirit-box-app, Property 22: Ouija spelling schedule', () => {
  /** **Validates: Requirements 13.1, 13.3** */
  it('before done, count = min(length, 30, floor(elapsed*12/1000)) within [0, length]', () => {
    fc.assert(
      fc.property(lengthArb, elapsedArb, (length, elapsed) => {
        const r = spellProgress(elapsed, length);
        expect(r.count).toBeGreaterThanOrEqual(0);
        expect(r.count).toBeLessThanOrEqual(length);
        if (!r.done) {
          const expected = Math.min(
            length,
            SPELL_MAX_CHARS,
            Math.floor((elapsed * SPELL_RATE_CPS) / 1000),
          );
          expect(r.count).toBe(expected);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 13.1, 13.3** */
  it('count is non-decreasing in elapsed time and done never reverts', () => {
    fc.assert(
      fc.property(lengthArb, fc.array(elapsedArb, { minLength: 2, maxLength: 12 }), (length, times) => {
        const sorted = [...times].sort((a, b) => a - b);
        let prev = spellProgress(sorted[0] as number, length);
        for (const t of sorted.slice(1)) {
          const cur = spellProgress(t, length);
          expect(cur.count).toBeGreaterThanOrEqual(prev.count);
          if (prev.done) expect(cur.done).toBe(true);
          prev = cur;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 13.1, 13.3** */
  it('done is true at 2500 ms or later, and then count equals length', () => {
    fc.assert(
      fc.property(lengthArb, fc.double({ min: SPELL_MAX_MS, max: 100000, noNaN: true }), (length, elapsed) => {
        const r = spellProgress(elapsed, length);
        expect(r.done).toBe(true);
        expect(r.count).toBe(length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 13.1, 13.3** */
  it('whenever done, count === length; when not done, count never exceeds 30', () => {
    fc.assert(
      fc.property(lengthArb, elapsedArb, (length, elapsed) => {
        const r = spellProgress(elapsed, length);
        if (r.done) expect(r.count).toBe(length);
        else expect(r.count).toBeLessThanOrEqual(SPELL_MAX_CHARS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
