import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { defineTransmitVolume, TRANSMIT_VOLUME } from '../../src/audio/constants';

const invalidVolume = fc.oneof(
  fc.integer({ min: -1_000_000, max: 0 }),
  fc.integer({ min: 101, max: 1_000_000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
  fc.constantFrom(Number.NaN, Infinity, -Infinity),
);

describe('transmit volume properties', () => {
  /**
   * Property 14: Transmit volume validation
   * **Validates: Requirements 9.18, 9.19**
   */
  it('Property 14: Transmit volume validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        expect(defineTransmitVolume(n)).toBe(n);
      }),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(invalidVolume, (n) => {
        let thrown: unknown;
        try {
          defineTransmitVolume(n);
        } catch (e) {
          thrown = e;
        }
        expect(thrown).toBeInstanceOf(RangeError);
        const message = (thrown as RangeError).message;
        expect(message).toContain(String(n));
        expect(message).toContain('1');
        expect(message).toContain('100');
      }),
      { numRuns: 200 },
    );

    expect(TRANSMIT_VOLUME).toBe(50);
  });
});
