// Feature: haunting-sounds, Property 29: The hint is shown if and only if all four conditions hold
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowSoundHint, type HintInputs } from '../../src/logic/sound-hint';

describe('Property 29: The hint is shown if and only if all four conditions hold', () => {
  it('is true iff soundOn, ios, awakened and no saved value', () => {
    // **Validates: Requirements 12.1, 12.3, 12.4, 12.5, 12.6, 12.12**
    const savedValue = fc.oneof(fc.constant(null), fc.constant(''), fc.string(), fc.string({ unit: 'binary' }));
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), savedValue, (soundOn, ios, awakened, saved) => {
        const input: HintInputs = { soundOn, ios, awakened, savedValue: saved };
        expect(shouldShowSoundHint(input)).toBe(soundOn && ios && awakened && saved === null);
      }),
      { numRuns: 200 },
    );
  });
});
