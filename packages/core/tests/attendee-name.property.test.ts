import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateAttendeeName } from '../src/attendee-name.js';
import { NUM_RUNS } from './helpers.js';

const WHITESPACE = [' ', '\t', '\n', '\r', '\u00a0', '\u2003', '\u3000', '\ufeff'];
const COMBINING = ['\u0301', '\u0308', '\u200d', '\u20e3'];
const PAIRS = ['\u{1f47b}', '\u{1d11e}', '\u{10400}', '\u{1f56f}'];

const pieceArb = fc.oneof(
  fc.constantFrom(...WHITESPACE),
  fc.constantFrom(...COMBINING),
  fc.constantFrom(...PAIRS),
  fc.string({ unit: 'grapheme', maxLength: 3 }),
  fc.string({ unit: 'binary', maxLength: 3 }),
);

/** Strings of mixed content, biased to hit the 32 code point boundary. */
const nameArb = fc
  .array(pieceArb, { maxLength: 40 })
  .map((parts) => parts.join(''));

/** Padding made only of whitespace, around a core of exactly n visible code points. */
const boundaryArb = fc
  .tuple(
    fc.integer({ min: 28, max: 36 }),
    fc.constantFrom('a', '\u{1f47b}', '\u0301'),
    fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 4 }),
    fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 4 }),
  )
  .map(([n, ch, lead, trail]) => ({
    n,
    text: lead.join('') + 'x' + ch.repeat(n - 1) + trail.join(''),
  }));

function codePoints(s: string): number {
  return Array.from(s).length;
}

describe('attendee-name validation', () => {
  // Feature: seance, Property 16: Attendee-name validation
  // **Validates: Requirements 14.2, 14.3**
  it('accepts exactly the trimmed 1..32 code point strings and returns the trimmed value', () => {
    fc.assert(
      fc.property(fc.oneof(nameArb, fc.string({ unit: 'binary', maxLength: 40 })), (input) => {
        const trimmed = input.trim();
        const n = codePoints(trimmed);
        const result = validateAttendeeName(input);
        if (n >= 1 && n <= 32) {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.value).toBe(trimmed);
        } else {
          expect(result.ok).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: seance, Property 16: Attendee-name validation
  // **Validates: Requirements 14.2, 14.3**
  it('counts code points, not UTF-16 units, at the 32 boundary', () => {
    fc.assert(
      fc.property(boundaryArb, ({ text }) => {
        const trimmed = text.trim();
        const n = codePoints(trimmed);
        const result = validateAttendeeName(text);
        expect(result.ok).toBe(n >= 1 && n <= 32);
        if (result.ok) expect(result.value).toBe(trimmed);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: seance, Property 16: Attendee-name validation
  // **Validates: Requirements 14.2, 14.3**
  it('rejects whitespace-only strings and never throws on any input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...WHITESPACE), { maxLength: 50 }).map((a) => a.join('')),
        (input) => {
          expect(validateAttendeeName(input).ok).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => validateAttendeeName(input)).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
