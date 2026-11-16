import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  SPELL_MAX_CHARS,
  SPELL_MAX_MS,
  SPELL_RATE_CPS,
  spellProgress,
  spellShown,
} from '../../src/logic/ouija';
import { scrapePlan, SCRAPE_STAGGER_MS } from '../../src/logic/haunt-rules';

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

const codePointArb = fc.oneof(
  fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u3000', '\u2003'),
  fc.constantFrom('0', '9', '.', '-', '/', 'é', '漢', '👻', '\u{10FFFF}'),
  fc.integer({ min: 0x21, max: 0x2fff }).map((n) => String.fromCodePoint(n)),
);
const charsArb = fc
  .array(codePointArb, { maxLength: 100 })
  .map((parts) => Array.from(parts.join('')));

const isWs = (ch: string): boolean => /^\s+$/u.test(ch);
const countLetters = (chars: readonly string[]): number => chars.filter((c) => !isWs(c)).length;

describe('Feature: haunting-sounds, Property 27: Stepping counts Letters and matches the scrape plan', () => {
  /** **Validates: Requirements 8.1, 8.3, 8.6** */
  it('stepping is monotonic, finishes with all shown, and scrapes match the Letters', () => {
    fc.assert(
      fc.property(
        charsArb,
        fc.array(fc.integer({ min: 1, max: 400 }), { maxLength: 30 }),
        (chars, jitter) => {
          const n = countLetters(chars);
          const times: number[] = [];
          for (let t = 0; t <= 2600; t += 10) times.push(t);
          for (const j of jitter) times.push(j * 6.5);
          times.sort((a, b) => a - b);

          let shown = 0;
          let done = false;
          const indexes: number[] = [];
          for (const t of times) {
            const r = spellShown(t, chars);
            // (a)
            expect(r.shown).toBeGreaterThanOrEqual(shown);
            expect(r.shown).toBeLessThanOrEqual(chars.length);
            // (d)
            if (!r.done) expect(r.letters).toBeLessThanOrEqual(SPELL_MAX_CHARS);
            expect(r.letters).toBe(countLetters(chars.slice(0, r.shown)));
            const plan = scrapePlan(chars, shown, r.shown);
            plan.forEach((s, j) => {
              expect(s.delayMs).toBe(j * SCRAPE_STAGGER_MS);
              indexes.push(s.letterIndex);
            });
            // (e)
            const stepped = chars.slice(shown, r.shown).filter((c) => !isWs(c)).length;
            expect(plan.length).toBeLessThanOrEqual(stepped);
            shown = r.shown;
            done = r.done;
          }
          // (b)
          expect(done).toBe(true);
          expect(shown).toBe(chars.length);
          // (c)
          const count = Math.min(n, SPELL_MAX_CHARS);
          expect(indexes).toEqual(Array.from({ length: count }, (_, i) => i));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 8.1, 8.3, 8.6** */
  it('a stalled timer (one jump from 0 to the end) still plans min(n, 30) scrapes at j*30 ms', () => {
    fc.assert(
      fc.property(charsArb, fc.double({ min: SPELL_MAX_MS, max: 1e7, noNaN: true }), (chars, end) => {
        const r = spellShown(end, chars);
        expect(r.done).toBe(true);
        expect(r.shown).toBe(chars.length);
        const plan = scrapePlan(chars, 0, r.shown);
        const count = Math.min(countLetters(chars), SPELL_MAX_CHARS);
        expect(plan).toHaveLength(count);
        plan.forEach((s, j) => {
          expect(s.letterIndex).toBe(j);
          expect(s.delayMs).toBe(j * 30);
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
