import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  HOLD_DURATION_MS,
  holdProgress,
  holdStep,
  type HoldEvent,
  type HoldState,
} from '../../src/logic/hold-machine';

const stateArb: fc.Arbitrary<HoldState> = fc.oneof(
  fc.constant<HoldState>({ kind: 'idle' }),
  fc.constant<HoldState>({ kind: 'fired' }),
  fc
    .double({ min: 0, max: HOLD_DURATION_MS, noNaN: true, maxExcluded: true })
    .map((elapsedMs): HoldState => ({ kind: 'holding', elapsedMs })),
);

const eventArb: fc.Arbitrary<HoldEvent> = fc.oneof(
  fc.constant<HoldEvent>({ kind: 'press' }),
  fc.constant<HoldEvent>({ kind: 'release' }),
  fc.constant<HoldEvent>({ kind: 'cancel' }),
  fc
    .oneof(fc.integer({ min: -2000, max: 2000 }), fc.double({ min: -2000, max: 2000, noNaN: true }))
    .map((elapsedMs): HoldEvent => ({ kind: 'tick', elapsedMs })),
);

/** Expected next state straight from the transition table. */
function expected(state: HoldState, event: HoldEvent): HoldState {
  if (state.kind === 'idle') {
    return event.kind === 'press' ? { kind: 'holding', elapsedMs: 0 } : state;
  }
  if (state.kind === 'fired') {
    return event.kind === 'release' || event.kind === 'cancel' ? { kind: 'idle' } : state;
  }
  switch (event.kind) {
    case 'press':
      return state;
    case 'release':
    case 'cancel':
      return { kind: 'idle' };
    case 'tick':
      return event.elapsedMs >= HOLD_DURATION_MS
        ? { kind: 'fired' }
        : { kind: 'holding', elapsedMs: Math.max(state.elapsedMs, event.elapsedMs, 0) };
  }
}

describe('hold machine properties', () => {
  // Feature: spirit-box-app, Property 10: Hold machine follows the transition table
  // **Validates: Requirements 8.5, 8.10, 17.6**
  it('Property 10: every step matches the transition table', () => {
    fc.assert(
      fc.property(stateArb, eventArb, (state, event) => {
        expect(holdStep(state, event)).toEqual(expected(state, event));
      }),
      { numRuns: 200 },
    );
  });

  it('Property 10: event sequences keep progress in [0, 1], idle is 0, fired is 1', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let state: HoldState = { kind: 'idle' };
        for (const event of events) {
          const next = holdStep(state, event);
          expect(next).toEqual(expected(state, event));
          const p = holdProgress(next);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
          if (next.kind === 'idle') expect(p).toBe(0);
          if (next.kind === 'fired') expect(p).toBe(1);
          state = next;
        }
      }),
      { numRuns: 200 },
    );
  });
});
