// Feature: haunting-sounds, Property 19: A full reveal gives exactly min(n, 30) scrapes
// **Validates: Requirements 8.1, 8.2, 8.6**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scrapePlan } from '../../src/logic/haunt-rules';
import { isLetter, SPELL_MAX_CHARS, spellShown } from '../../src/logic/ouija';

const charArb = fc.oneof(
  fc.constantFrom(' ', '\n', '\t', '\u00a0', '\u3000'),
  fc.constantFrom('a', 'Z', '7', '!', 'é', '\u{1F47B}'),
  fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }),
);

// n Letters (0..100) with whitespace anywhere
const textArb = fc
  .array(charArb, { minLength: 0, maxLength: 160 })
  .map((cs) => {
    let letters = 0;
    const out: string[] = [];
    for (const c of cs) {
      if (isLetter(c)) {
        if (letters >= 100) continue;
        letters += 1;
      }
      out.push(c);
    }
    return out;
  });

describe('Property 19: a full reveal gives exactly min(n, 30) scrapes', () => {
  it('stepping spellShown over time yields min(n, 30) scrapes at distinct indexes', () => {
    fc.assert(
      fc.property(textArb, fc.integer({ min: 1, max: 400 }), (chars, stepMs) => {
        const n = chars.filter(isLetter).length;
        const expected = Math.min(n, SPELL_MAX_CHARS);

        const indexes: number[] = [];
        let shownBefore = 0;
        const times: number[] = [];
        for (let t = 0; t < 2500; t += stepMs) times.push(t);
        times.push(2500);
        for (const t of times) {
          const { shown } = spellShown(t, chars);
          const plan = scrapePlan(chars, shownBefore, shown);
          for (const req of plan) {
            // no scrape for whitespace: plan size never exceeds new Letters
            indexes.push(req.letterIndex);
          }
          const newLetters = chars.slice(shownBefore, shown).filter(isLetter).length;
          expect(plan.length).toBeLessThanOrEqual(newLetters);
          shownBefore = Math.max(shownBefore, shown);
        }

        expect(spellShown(2500, chars).shown).toBe(chars.length);
        expect(indexes.length).toBe(expected);
        expect([...indexes].sort((a, b) => a - b)).toEqual(
          Array.from({ length: expected }, (_, i) => i),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('a single call over the whole text gives the same count and indexes', () => {
    fc.assert(
      fc.property(textArb, (chars) => {
        const n = chars.filter(isLetter).length;
        const expected = Math.min(n, SPELL_MAX_CHARS);
        const plan = scrapePlan(chars, 0, chars.length);
        expect(plan.length).toBe(expected);
        expect(plan.map((r) => r.letterIndex)).toEqual(
          Array.from({ length: expected }, (_, i) => i),
        );
      }),
      { numRuns: 200 },
    );
  });
});
