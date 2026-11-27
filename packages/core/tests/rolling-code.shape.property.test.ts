import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { WINDOW_SECONDS, rollingCode, windowNumber } from '../src/rolling-code.js';
import { NUM_RUNS } from './helpers.js';

/**
 * Synchronous HMAC-SHA-256 + RFC 4226 truncation, used only so the colliding
 * neighbouring-window pairs can be dropped with fast-check's (sync) `filter`.
 * The assertions below always call the real `rollingCode`.
 */
function referenceCode(secret: Uint8Array, w: number): string {
  const h = createHmac('sha256', secret).update(String(w)).digest();
  const o = (h[31] as number) & 0x0f;
  const v =
    ((((h[o] as number) & 0x7f) << 24) |
      ((h[o + 1] as number) << 16) |
      ((h[o + 2] as number) << 8) |
      (h[o + 3] as number)) >>>
    0;
  return String(v % 1_000_000).padStart(6, '0');
}

const MAX_WINDOW = Number.MAX_SAFE_INTEGER; // 2^53 - 1
/** Largest Window_Number whose start time (w * 30) is still an exact double. */
const MAX_TIMED_WINDOW = Math.floor(MAX_WINDOW / WINDOW_SECONDS) - 1;

const secretArb = fc.uint8Array({ minLength: 1, maxLength: 64 });
/** Whole-second offset inside one window (exact in a double even for huge windows). */
const offsetArb = fc.integer({ min: 0, max: WINDOW_SECONDS - 1 });

describe('rolling-code shape, determinism and windows', () => {
  // Feature: seance, Property 6: Rolling-code shape, determinism and window behavior
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  it('Feature: seance, Property 6: shape and determinism for any window 0..2^53-1', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, fc.integer({ min: 0, max: MAX_WINDOW }), async (secret, w) => {
        const code = await rollingCode(secret, w);
        expect(code).toMatch(/^[0-9]{6}$/);
        expect(await rollingCode(secret, w)).toBe(code);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: seance, Property 6: Rolling-code shape, determinism and window behavior
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  it('Feature: seance, Property 6: same code across a window, different code in the next window', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb
          .chain((secret) =>
            fc.tuple(fc.constant(secret), fc.integer({ min: 0, max: MAX_TIMED_WINDOW })),
          )
          // Option (a): re-draw when neighbouring windows genuinely collide (1 in 1,000,000).
          .filter(([secret, w]) => referenceCode(secret, w) !== referenceCode(secret, w + 1)),
        offsetArb,
        offsetArb,
        offsetArb,
        async ([secret, w], offsetA, offsetB, offsetNext) => {
          const start = w * WINDOW_SECONDS;
          const tA = start + offsetA;
          const tB = start + offsetB;
          const tNext = start + WINDOW_SECONDS + offsetNext;
          expect(windowNumber(tA)).toBe(w);
          expect(windowNumber(tB)).toBe(w);
          expect(windowNumber(tNext)).toBe(w + 1);

          const codeA = await rollingCode(secret, windowNumber(tA));
          const codeB = await rollingCode(secret, windowNumber(tB));
          const codeNext = await rollingCode(secret, windowNumber(tNext));
          expect(codeB).toBe(codeA);
          expect(codeNext).not.toBe(codeA);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
