import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCheckinText } from '../src/checkin-body.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 3: Parser rejects every malformed text, and only malformed text

// Hardcoded on purpose, so a wrong constant in src/ cannot hide behind a matching one here.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CANONICAL_RE = /^S1:[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}:[0-9]{6}$/;

const idArb = fc
  .array(fc.constantFrom(...ALPHABET.split('')), { minLength: 8, maxLength: 8 })
  .map((a) => a.join(''));
const codeArb = fc
  .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));

/** Characters that can never appear in a canonical text. */
const junkChar = fc.constantFrom(' ', '\n', '\t', ':', 'a', 'z', '0', '1', 'O', 'I', 'L', '-', 'é', '😀', '\u0000');

const validArb = fc.tuple(idArb, codeArb).map(([id, code]) => ({ id, code, text: `S1:${id}:${code}` }));

/** Independently corrupts a valid text. Every result differs from the canonical form. */
const corruptedArb = validArb.chain(({ id, code, text }) =>
  fc.oneof(
    // wrong prefix
    fc.constantFrom('s1', 'S2', 'S', '1S', 'SI', '').map((p) => `${p}:${id}:${code}`),
    // wrong-length session ID
    fc.nat({ max: 7 }).map((n) => `S1:${id.slice(0, n)}:${code}`),
    junkChar.map((c) => `S1:${id}${c}:${code}`),
    // session ID with one character outside the alphabet
    fc
      .tuple(fc.nat({ max: 7 }), fc.constantFrom('0', '1', 'O', 'I', 'L', 'a', ' ', '-'))
      .map(([i, c]) => `S1:${id.slice(0, i)}${c}${id.slice(i + 1)}:${code}`),
    // wrong-length code
    fc.nat({ max: 5 }).map((n) => `S1:${id}:${code.slice(0, n)}`),
    fc.constantFrom('0', '7').map((d) => `S1:${id}:${code}${d}`),
    // non-digit code character
    fc
      .tuple(fc.nat({ max: 5 }), fc.constantFrom('a', ' ', '-', 'O', '٣', '.'))
      .map(([i, c]) => `S1:${id}:${code.slice(0, i)}${c}${code.slice(i + 1)}`),
    // missing or wrong separator
    fc.constantFrom('', ' ', '-', '::').map((s) => `S1:${id}${s}${code}`),
    fc.constantFrom('', ' ', '-').map((s) => `S1${s}${id}:${code}`),
    // extra leading or trailing characters, including whitespace and a trailing ':'
    junkChar.map((c) => `${c}${text}`),
    junkChar.map((c) => `${text}${c}`),
    fc.array(junkChar, { minLength: 1, maxLength: 4 }).map((a) => `${text}${a.join('')}`),
  ),
);

describe('Feature: seance, Property 3: parseCheckinText rejects every malformed text, and only malformed text', () => {
  it('rejects every corruption of a valid text with invalid-body and no fields', () => {
    fc.assert(
      fc.property(corruptedArb, (text) => {
        fc.pre(!CANONICAL_RE.test(text));
        const r = parseCheckinText(text);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error.code).toBe('invalid-body');
          expect('value' in r).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('accepts every canonical text and returns its fields', () => {
    fc.assert(
      fc.property(validArb, ({ id, code, text }) => {
        const r = parseCheckinText(text);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({ sessionId: id, code });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('accepts an arbitrary string exactly when it matches the canonical form', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString(), corruptedArb), (text) => {
        expect(parseCheckinText(text).ok).toBe(CANONICAL_RE.test(text));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
