import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCheckinText } from '../src/checkin-body.js';
import { NUM_RUNS } from './helpers.js';

/** True when `value` has the shape of a Result. */
function isResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { ok?: unknown; value?: unknown; error?: { code?: unknown } };
  if (r.ok === true) return typeof r.value === 'object' && r.value !== null;
  if (r.ok === false) return typeof r.error?.code === 'string';
  return false;
}

// Feature: seance, Property 5: Parser totality
describe('parseCheckinText totality (property)', () => {
  it('returns a Result and never throws for any string', () => {
    // **Validates: Requirements 1.7**
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), (text) => {
        expect(isResult(parseCheckinText(text))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns a Result for the empty string and strings of 10,000+ characters', () => {
    // **Validates: Requirements 1.7**
    expect(isResult(parseCheckinText(''))).toBe(true);
    fc.assert(
      fc.property(fc.string({ minLength: 10_000, maxLength: 12_000 }), (text) => {
        expect(isResult(parseCheckinText(text))).toBe(true);
        expect(isResult(parseCheckinText(`S1:ABCDEFGH:123456${text}`))).toBe(true);
      }),
      { numRuns: Math.min(NUM_RUNS, 25) },
    );
  });
});
