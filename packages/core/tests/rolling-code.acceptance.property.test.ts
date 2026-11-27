import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rollingCode, verifyCode, windowNumber } from '../src/rolling-code.js';
import { NUM_RUNS } from './helpers.js';

const secretArb = fc.uint8Array({ minLength: 1, maxLength: 64 });

// Time is at least two Windows in, so the Window two before exists.
const nowArb = fc.integer({ min: 60, max: 4_000_000_000 });

describe('rolling code acceptance set', () => {
  // Feature: seance, Property 8: Code_Verifier acceptance set
  /** **Validates: Requirements 2.5, 2.6, 2.7, 2.9** */
  it('accepts the current and previous Window codes and rejects the others unless they equal an accepted code', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, nowArb, async (secret, now) => {
        const w = windowNumber(now);
        const current = await rollingCode(secret, w);
        const previous = await rollingCode(secret, w - 1);
        const twoBefore = await rollingCode(secret, w - 2);
        const next = await rollingCode(secret, w + 1);

        // Accepted set (2.5, 2.6)
        expect(await verifyCode(secret, current, now)).toBe(true);
        expect(await verifyCode(secret, previous, now)).toBe(true);

        // Rejected set (2.7, 2.9): false unless the code equals an accepted code.
        for (const code of [twoBefore, next]) {
          const accepted = code === current || code === previous;
          expect(await verifyCode(secret, code, now)).toBe(accepted);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
