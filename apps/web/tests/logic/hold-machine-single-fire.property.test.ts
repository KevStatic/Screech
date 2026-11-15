import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { holdProgress, holdStep, type HoldEvent, type HoldState } from '../../src/logic/hold-machine';

// Feature: spirit-box-app, Property 11: Hold fires at most once per press
// **Validates: Requirements 8.6, 8.11, 8.12**

const eventArb: fc.Arbitrary<HoldEvent> = fc.oneof(
  fc.constant<HoldEvent>({ kind: 'press' }),
  fc.constant<HoldEvent>({ kind: 'release' }),
  fc.constant<HoldEvent>({ kind: 'cancel' }),
  fc.integer({ min: -100, max: 1000 }).map<HoldEvent>((elapsedMs) => ({ kind: 'tick', elapsedMs })),
);

const sequenceArb = fc.array(eventArb, { maxLength: 80 });

describe('Property 11: Hold fires at most once per press', () => {
  it('fires at most once per press and never re-fires on auto-repeat', () => {
    fc.assert(
      fc.property(sequenceArb, (events) => {
        let state: HoldState = { kind: 'idle' };
        let fires = 0;
        for (const event of events) {
          const prev = state;
          state = holdStep(prev, event);

          if (prev.kind === 'idle' && event.kind === 'press') fires = 0; // new press
          if (state.kind === 'fired' && prev.kind !== 'fired') fires += 1;

          expect(fires).toBeLessThanOrEqual(1);

          // Auto-repeat while holding or fired changes nothing.
          if (event.kind === 'press' && prev.kind !== 'idle') {
            expect(state).toEqual(prev);
          }
          // Release or cancel after fired returns idle.
          if (prev.kind === 'fired' && (event.kind === 'release' || event.kind === 'cancel')) {
            expect(state.kind).toBe('idle');
          }
          // Progress is 1 once fired.
          if (state.kind === 'fired') expect(holdProgress(state)).toBe(1);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('a fired state only leaves via release or cancel', () => {
    fc.assert(
      fc.property(sequenceArb, (events) => {
        let state: HoldState = { kind: 'fired' };
        for (const event of events) {
          const next = holdStep(state, event);
          if (state.kind === 'fired' && event.kind !== 'release' && event.kind !== 'cancel') {
            expect(next.kind).toBe('fired');
          }
          state = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});
