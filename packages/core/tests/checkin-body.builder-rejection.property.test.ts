import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCheckin, buildCheckinText, validateCheckinFields } from '../src/checkin-body.js';
import { HUNT_ALPHABET } from '../src/hunt-clue.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 4: Builder rejects every malformed field, and only malformed fields
// **Validates: Requirements 1.6**

const alphabetChar = fc.constantFrom(...HUNT_ALPHABET.split(''));
const validIdArb = fc.array(alphabetChar, { minLength: 8, maxLength: 8 }).map((a) => a.join(''));
const validCodeArb = fc
  .array(fc.constantFrom(...'0123456789'.split('')), { minLength: 6, maxLength: 6 })
  .map((a) => a.join(''));

const nonStringArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.constant({}),
);

/** Strings that are not exactly 8 Hunt-alphabet characters. */
const badIdArb = fc.oneof(
  fc.constant(''),
  nonStringArb,
  fc.string({ maxLength: 20 }).filter((s) => !(s.length === 8 && [...s].every((c) => HUNT_ALPHABET.includes(c)))),
  // Right length with one character outside the alphabet.
  fc
    .tuple(validIdArb, fc.integer({ min: 0, max: 7 }), fc.constantFrom('0', 'O', '1', 'I', 'l', ' ', ':', '\n', 'é'))
    .map(([id, i, ch]) => id.slice(0, i) + ch + id.slice(i + 1))
    .filter((s) => ![...s].every((c) => HUNT_ALPHABET.includes(c)) || s.length !== 8),
  // Wrong length but valid characters.
  fc.array(alphabetChar, { maxLength: 20 }).filter((a) => a.length !== 8).map((a) => a.join('')),
);

/** Values that are not exactly 6 decimal digits. */
const badCodeArb = fc.oneof(
  fc.constant(''),
  nonStringArb,
  fc.string({ maxLength: 12 }).filter((s) => !/^[0-9]{6}$/.test(s)),
  fc.stringMatching(/^[0-9]{0,12}$/).filter((s) => s.length !== 6),
  validCodeArb.map((c) => `${c}\n`),
  validCodeArb.map((c) => ` ${c}`),
  validCodeArb.map((c) => `${c.slice(0, 5)}x`),
  // Non-ASCII digits are not decimal digits for this protocol.
  fc.constant('٠١٢٣٤٥'),
);

describe('checkin builder rejection (property)', () => {
  it('rejects a malformed sessionId and names it, whatever the code is', () => {
    fc.assert(
      fc.property(badIdArb, fc.oneof(validCodeArb, badCodeArb), (sessionId, code) => {
        const input = { sessionId, code };
        const v = validateCheckinFields(input);
        expect(v.ok).toBe(false);
        if (!v.ok) {
          expect(v.error.code).toBe('invalid-payload');
          expect((v.error as { field?: string }).field).toBe('sessionId');
          expect('value' in v).toBe(false);
        }
        const b = buildCheckin(input);
        expect(b.ok).toBe(false);
        expect('value' in b).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects a malformed code with a valid sessionId and names the code field', () => {
    fc.assert(
      fc.property(validIdArb, badCodeArb, (sessionId, code) => {
        const input = { sessionId, code };
        const v = validateCheckinFields(input);
        expect(v.ok).toBe(false);
        if (!v.ok) expect((v.error as { field?: string }).field).toBe('code');
        const b = buildCheckin(input);
        expect(b.ok).toBe(false);
        expect('value' in b).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('accepts every well-formed pair (only malformed fields are rejected)', () => {
    fc.assert(
      fc.property(validIdArb, validCodeArb, (sessionId, code) => {
        const v = validateCheckinFields({ sessionId, code });
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value).toEqual({ sessionId, code });
        const b = buildCheckin({ sessionId, code });
        expect(b.ok).toBe(true);
        expect(buildCheckinText({ sessionId, code })).toBe(`S1:${sessionId}:${code}`);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('rejects missing fields and non-object input', () => {
    for (const input of [{}, { sessionId: undefined, code: undefined }, null, undefined, 'x', 5]) {
      const v = validateCheckinFields(input as never);
      expect(v.ok).toBe(false);
      expect(buildCheckin(input as never).ok).toBe(false);
    }
  });
});
