// Feature: haunting-sounds, Property 13: A packet is louder than every haunting sound
// Real ggwave engine, no mocks. Validates: Requirements 3.7
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { loadEngine } from '../../src/audio/engine';
import { HAUNT_PEAK_LIMIT, SOUND_NAMES, generateSound } from '../../src/logic/haunt-synth';

function peak(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

describe('Property 13: A packet is louder than every haunting sound', () => {
  for (const sampleRate of [44100, 48000]) {
    describe(`at ${sampleRate} Hz`, () => {
      it('the packet peak is above HAUNT_PEAK_LIMIT and every haunting sound peak', async () => {
        const loaded = await loadEngine(sampleRate);
        if (!loaded.ok) throw new Error(loaded.message);
        const { engine } = loaded;

        fc.assert(
          fc.property(
            fc.uint8Array({ minLength: 1, maxLength: 100 }),
            fc.integer({ min: 0, max: 0xffffffff }),
            (packet, seed) => {
              const packetPeak = peak(engine.encode(packet));
              expect(packetPeak).toBeGreaterThan(HAUNT_PEAK_LIMIT);
              for (const name of SOUND_NAMES) {
                const soundPeak = peak(generateSound(name, sampleRate, seed));
                expect(soundPeak, `${name} seed ${seed}`).toBeLessThan(packetPeak);
                // Design: at least twice as loud.
                expect(packetPeak, `${name} seed ${seed}`).toBeGreaterThanOrEqual(2 * soundPeak);
              }
            },
          ),
          { numRuns: 100 },
        );
      });

      it('unit: HAUNT_PEAK_LIMIT is below the packet peak', async () => {
        const loaded = await loadEngine(sampleRate);
        if (!loaded.ok) throw new Error(loaded.message);
        const packetPeak = peak(loaded.engine.encode(new Uint8Array([1, 2, 3, 4, 5])));
        expect(HAUNT_PEAK_LIMIT).toBeLessThan(packetPeak);
      });
    });
  }
});
