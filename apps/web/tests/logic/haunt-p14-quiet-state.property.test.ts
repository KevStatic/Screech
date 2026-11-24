// Feature: haunting-sounds, Property 14: Quiet_State is exactly listen, capture, screeching or playback
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Screen } from '../../src/logic/flow';
import { quietState } from '../../src/logic/haunt-rules';

const SCREENS: readonly Screen[] = [
  'awaken',
  'speak',
  'screeching',
  'listen',
  'reveal',
  'garbled',
  'sealed',
  'hunt-setup',
  'hunt-reveal',
  'hunt-complete',
];

const inputs = fc.record({
  screen: fc.constantFrom(...SCREENS),
  captureActive: fc.boolean(),
  playbackRunning: fc.boolean(),
});

const inputsWithBeacon = fc.record({
  screen: fc.constantFrom(...SCREENS),
  captureActive: fc.boolean(),
  playbackRunning: fc.boolean(),
  beaconActive: fc.boolean(),
});

describe('Property 14: Quiet_State', () => {
  it('is true iff listen, screeching, capture active or playback running', () => {
    // **Validates: Requirements 5.8, 5.9**
    fc.assert(
      fc.property(inputs, (i) => {
        const expected =
          i.screen === 'listen' || i.screen === 'screeching' || i.captureActive || i.playbackRunning;
        expect(quietState(i)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('is also quiet whenever a hunt beacon is active', () => {
    // **Validates: Requirements 7.10**
    fc.assert(
      fc.property(inputsWithBeacon, (i) => {
        const expected =
          i.screen === 'listen' ||
          i.screen === 'screeching' ||
          i.captureActive ||
          i.playbackRunning ||
          i.beaconActive;
        expect(quietState(i)).toBe(expected);
        if (i.beaconActive) expect(quietState(i)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and does not mutate its input', () => {
    // **Validates: Requirements 5.8, 5.9**
    fc.assert(
      fc.property(inputs, (i) => {
        const copy = { ...i };
        const a = quietState(i);
        const b = quietState(i);
        expect(a).toBe(b);
        expect(i).toEqual(copy);
      }),
      { numRuns: 200 },
    );
  });
});
