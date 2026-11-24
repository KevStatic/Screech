import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HUNT_ALPHABET } from '@screech/core';
import { huntIdFromBytes, HUNT_ID_REJECT_FROM } from '../../src/logic/hunt-id';

function reference(bytes: readonly number[]): string | null {
  const chars = bytes.filter((b) => b < 217).map((b) => HUNT_ALPHABET[b % 31]);
  return chars.length >= 6 ? chars.slice(0, 6).join('') : null;
}

// Feature: ghost-hunt, Property 7: Hunt_ID generation
describe('Property 7: Hunt_ID generation', () => {
  it('matches the reference, is deterministic, uses only alphabet characters and never throws', () => {
    // **Validates: Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 16.12**
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 40 }), (bytes) => {
        const a = huntIdFromBytes(bytes);
        const b = huntIdFromBytes(bytes);
        expect(a).toEqual(b);
        const expected = reference(bytes);
        if (expected === null) {
          expect(a).toEqual({ ok: false, reason: 'not-enough-bytes' });
        } else {
          expect(a).toEqual({ ok: true, id: expected });
          if (a.ok) {
            expect(a.id).toHaveLength(6);
            for (const ch of a.id) expect(HUNT_ALPHABET).toContain(ch);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('huntIdFromBytes', () => {
  it('rejects from 217', () => {
    expect(HUNT_ID_REJECT_FROM).toBe(217);
  });

  it('gives the error when every byte is 217 or more', () => {
    const bytes = Array.from({ length: 50 }, (_, i) => 217 + (i % 39));
    expect(huntIdFromBytes(bytes)).toEqual({ ok: false, reason: 'not-enough-bytes' });
  });

  it('gives the error for an empty array', () => {
    expect(huntIdFromBytes([])).toEqual({ ok: false, reason: 'not-enough-bytes' });
  });

  it('maps a known byte array to a known ID', () => {
    expect(huntIdFromBytes([0, 1, 2, 3, 4, 5])).toEqual({ ok: true, id: '234567' });
  });

  it('skips rejected bytes and wraps modulo 31', () => {
    // 217 and 255 skipped; 0 -> 2, 30 -> Z, 31 -> 2, 61 -> Z, 62 -> 2, 1 -> 3
    expect(huntIdFromBytes([217, 0, 255, 30, 31, 61, 62, 1])).toEqual({ ok: true, id: '2Z2Z23' });
  });
});
