// Feature: haunting-sounds, Property 22: Only 0 means off
// **Validates: Requirements 9.7, 9.14**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseSound } from '../../src/logic/sound-pref';

describe('Property 22: Only 0 means off', () => {
  it('parseSound(s) is false iff s === "0", for any string', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant('0'), fc.constantFrom('1', '', ' 0', '0 ', '00', 'false', 'off')),
        (s: string) => {
          expect(parseSound(s)).toBe(s !== '0');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns true for null and undefined', () => {
    expect(parseSound(null)).toBe(true);
    expect(parseSound(undefined)).toBe(true);
  });
});
