import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ggwaveViewToBytes } from '../../src/logic/bytes';

/** Arbitrary Int8Array view, often with a non-zero byteOffset into a larger buffer. */
const viewArb = fc
  .record({
    data: fc.array(fc.integer({ min: -128, max: 127 }), { maxLength: 200 }),
    before: fc.nat(32),
    after: fc.nat(32),
  })
  .map(({ data, before, after }) => {
    const backing = new Int8Array(before + data.length + after);
    backing.set(data, before);
    return backing.subarray(before, before + data.length);
  });

describe('bytes properties', () => {
  /**
   * Feature: spirit-box-app, Property 13: ggwave byte conversion copies
   * **Validates: Requirements 9.6, 9.17**
   */
  it('Feature: spirit-box-app, Property 13: ggwave byte conversion copies', () => {
    fc.assert(
      fc.property(viewArb, (view) => {
        const expected = Array.from(view, (b) => b & 0xff);
        const out = ggwaveViewToBytes(view);

        expect(out).toBeInstanceOf(Uint8Array);
        expect(Array.from(out)).toEqual(expected);
        expect(out.buffer).not.toBe(view.buffer);

        // Mutating the input afterwards must not change the output.
        view.fill(0x55);
        expect(Array.from(out)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
