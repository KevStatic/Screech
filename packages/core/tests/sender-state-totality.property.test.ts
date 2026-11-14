import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextSenderState } from '../src/sender-state.js';
import type { SenderState } from '../src/types.js';
import { anythingArb, counterArb, senderIdArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

/** Calls `nextSenderState` with values the type system would reject. */
function nextUnchecked(previous: unknown, fill?: unknown) {
  return (nextSenderState as (p?: unknown, f?: unknown) => ReturnType<typeof nextSenderState>)(
    previous,
    fill,
  );
}

describe('nextSenderState totality and input isolation properties', () => {
  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.7**
  it('Property 20: nextSenderState returns a Result for arbitrary values and never throws', () => {
    fc.assert(
      fc.property(anythingArb, (previous) => {
        const result = nextUnchecked(previous);
        expect(typeof result.ok).toBe('boolean');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 10.7**
  it('Property 20: nextSenderState returns a Result for arbitrary values as the random source', () => {
    fc.assert(
      fc.property(anythingArb, (fill) => {
        const fromNothing = nextUnchecked(undefined, fill);
        expect(typeof fromNothing.ok).toBe('boolean');
        const rollover = nextUnchecked(
          { senderId: new Uint8Array(4), counter: 65535 },
          fill,
        );
        expect(typeof rollover.ok).toBe('boolean');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: screech-protocol, Property 21: Inputs are not modified or retained
  // **Validates: Requirements 9.5, 9.6, 10.5**
  it('Property 21: the input Sender_ID is unchanged and the returned senderId is a fresh array', () => {
    fc.assert(
      fc.property(senderIdArb, counterArb, (senderId, counter) => {
        const state: SenderState = { senderId, counter };
        const before = Array.from(senderId);
        const result = nextSenderState(state);
        expect(Array.from(senderId)).toEqual(before);
        expect(state.senderId).toBe(senderId);
        expect(state.counter).toBe(counter);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.senderId).not.toBe(senderId);
          expect(result.value.senderId.buffer).not.toBe(senderId.buffer);
          // Mutating the output must not change the input.
          result.value.senderId.fill(0xff);
          expect(Array.from(senderId)).toEqual(before);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
