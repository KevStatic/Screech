import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encode, SIZE_CAP } from '@screech/core';
import { budget } from '../../src/logic/byte-budget';
import { anySizePayload } from './arbitraries';

describe('byte-budget properties', () => {
  /**
   * Property 7: Byte budget agrees with Core encode
   * **Validates: Requirements 7.2, 7.3, 7.8, 7.9, 7.10, 7.11**
   */
  it('Property 7: Byte budget agrees with Core encode', () => {
    let sawOk = false;
    let sawTooLarge = false;

    fc.assert(
      fc.property(anySizePayload, (p) => {
        const result = encode(p);
        const b = budget(result);

        expect(b.fill).toBeGreaterThanOrEqual(0);
        expect(b.fill).toBeLessThanOrEqual(1);

        if (result.ok) {
          sawOk = true;
          expect(b.status).toBe('ok');
          expect(b.size).toBe(result.value.length);
          expect(b.fill).toBe(Math.min(1, result.value.length / SIZE_CAP));
          expect(b.message).toBeNull();
        } else if (result.error.code === 'too-large') {
          sawTooLarge = true;
          expect(b.status).toBe('too-large');
          expect(b.fill).toBe(1);
          expect(b.size).toBe(result.error.length);
          expect(b.message).toBe(`Too heavy to cross over (${result.error.length}/${SIZE_CAP} bytes)`);
        }
      }),
      { numRuns: 200 },
    );

    // The generator must exercise both sides of the cap.
    expect(sawOk).toBe(true);
    expect(sawTooLarge).toBe(true);
  });
});
