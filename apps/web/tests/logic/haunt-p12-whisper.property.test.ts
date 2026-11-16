// Feature: haunting-sounds, Property 12: Whisper is spread noise
// **Validates: Requirements 1.10**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateWhisper } from '../../src/logic/haunt-synth';
import { peakBandShare } from './haunt-fft';

describe('Property 12: Whisper is spread noise', () => {
  it('no 10 Hz band holds more than half of the whisper energy', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(44100, 48000), fc.integer({ min: 22050, max: 96000 })),
        fc.integer({ min: 0, max: 0xffffffff }),
        (rate, seed) => {
          const x = generateWhisper(rate, seed);
          expect(peakBandShare(x, rate, 10)).toBeLessThanOrEqual(0.5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
