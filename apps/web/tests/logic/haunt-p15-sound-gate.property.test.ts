// Feature: haunting-sounds, Property 15: Sound_Gate is the conjunction of four conditions
// **Validates: Requirements 5.1, 5.6, 5.7, 6.4, 6.7, 9.9**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { soundGate } from '../../src/logic/haunt-rules';

const inputs = fc.record({
  awakened: fc.boolean(),
  contextRunning: fc.boolean(),
  soundOn: fc.boolean(),
  quiet: fc.boolean(),
});

describe('Property 15: Sound_Gate is the conjunction of four conditions', () => {
  it('equals awakened && contextRunning && soundOn && !quiet', () => {
    fc.assert(
      fc.property(inputs, (i) => {
        expect(soundGate(i)).toBe(i.awakened && i.contextRunning && i.soundOn && !i.quiet);
      }),
      { numRuns: 100 },
    );
  });

  it('closes when any single condition takes its closing value', () => {
    fc.assert(
      fc.property(inputs, (i) => {
        expect(soundGate({ ...i, awakened: false })).toBe(false);
        expect(soundGate({ ...i, contextRunning: false })).toBe(false);
        expect(soundGate({ ...i, soundOn: false })).toBe(false);
        expect(soundGate({ ...i, quiet: true })).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
