// Feature: haunting-sounds, Property 21: Sound preference round trip
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseSound, serializeSound } from '../../src/logic/sound-pref';

describe('Property 21: Sound preference round trip', () => {
  /** **Validates: Requirements 9.12, 9.13** */
  it('parseSound(serializeSound(on)) equals on, and the value is "1" or "0"', () => {
    fc.assert(
      fc.property(fc.boolean(), (on: boolean) => {
        const raw = serializeSound(on);
        expect(raw === '1' || raw === '0').toBe(true);
        expect(parseSound(raw)).toBe(on);
      }),
      { numRuns: 100 },
    );
  });
});
