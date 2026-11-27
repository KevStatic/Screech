import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { verifyCode } from '../src/rolling-code.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 7: Code_Verifier totality on malformed input
// **Validates: Requirements 2.8, 2.11**

const secretArb = fc.uint8Array({ minLength: 1, maxLength: 64 });

const SIX_DIGITS = /^[0-9]{6}$/;

/** Anything that is not exactly 6 characters in "0" to "9" (strings and non-strings). */
const malformedCodeArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().filter((s) => !SIX_DIGITS.test(s)),
  fc.stringMatching(/^[0-9]{0,5}$/),
  fc.stringMatching(/^[0-9]{7,12}$/),
  fc.stringMatching(/^[0-9]{5}[a-z \n+-]$/),
  fc.constantFrom('', '12345', '1234567', '12345\n', ' 12345', '١٢٣٤٥٦', '12 456', '12345a'),
  fc.constantFrom(null, undefined, 123456, 0, true, [], {}, ['1', '2', '3', '4', '5', '6']),
);

/** Always-valid code shape, so only the time argument is malformed. */
const wellFormedCodeArb = fc.stringMatching(/^[0-9]{6}$/);

/** Negative, non-finite or non-number time. */
const badTimeArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.double({ max: -1e-9, noNaN: true }),
  fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
  fc.constantFrom(NaN, Infinity, -Infinity),
  fc.constantFrom('1700000000', '', 'abc', null, undefined, {}, [], true, 10n),
  fc.string(),
);

const anyTimeArb: fc.Arbitrary<unknown> = fc.oneof(
  badTimeArb,
  fc.double({ min: 0, max: 1e12, noNaN: true }),
  fc.constantFrom(0, 1, 29.999, 30, 1_700_000_000),
);

async function callVerify(secret: Uint8Array, code: unknown, time: unknown): Promise<unknown> {
  return verifyCode(secret, code as string, time as number);
}

describe('Feature: seance, Property 7: Code_Verifier totality on malformed input', () => {
  it('returns false and never throws for a malformed code at any time', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, malformedCodeArb, anyTimeArb, async (secret, code, time) => {
        await expect(callVerify(secret, code, time)).resolves.toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns false and never throws for a negative, non-finite or non-number time', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, wellFormedCodeArb, badTimeArb, async (secret, code, time) => {
        await expect(callVerify(secret, code, time)).resolves.toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns false and never throws when both the code and the time are malformed', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, malformedCodeArb, badTimeArb, async (secret, code, time) => {
        await expect(callVerify(secret, code, time)).resolves.toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
