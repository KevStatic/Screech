import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  BEACON_STOPPED,
  beaconStep,
  type BeaconEvent,
  type BeaconState,
} from '../../src/logic/beacon-machine';

type Kind =
  | 'start'
  | 'tick'
  | 'visible'
  | 'screechEnded'
  | 'contextFailed'
  | 'wakeSucceeded'
  | 'stop';

interface Step {
  readonly kind: Kind;
  readonly dt: number;
  readonly random: number;
  readonly skip: boolean;
}

const unit = fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true });

const stepArb: fc.Arbitrary<Step> = fc.record({
  kind: fc.constantFrom<Kind>(
    'start',
    'tick',
    'tick',
    'tick',
    'visible',
    'screechEnded',
    'contextFailed',
    'wakeSucceeded',
    'stop',
  ),
  // Mix of small tick gaps and long sleeps. Never negative: timestamps do not decrease.
  dt: fc.oneof(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 700_000 })),
  random: unit,
  skip: fc.boolean(),
});

function toEvent(kind: Kind, now: number): BeaconEvent {
  switch (kind) {
    case 'contextFailed':
    case 'stop':
      return { type: kind };
    default:
      return { type: kind, now };
  }
}

describe('beacon-machine properties', () => {
  // Feature: ghost-hunt, Property 26: Beacon machine safety
  // **Validates: Requirements 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 9.5, 9.6, 9.8**
  it('Property 26: Beacon machine safety', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 80 }), (steps) => {
        let state: BeaconState = BEACON_STOPPED;
        let now = 0;
        let lastStart: number | null = null;
        let awaitingAnswer = false;

        for (const s of steps) {
          now += s.dt;
          const prev = state;
          const out = beaconStep(prev, toEvent(s.kind, now));
          state = out.state;

          // Nothing happens while stopped, except `start`.
          if (prev.kind === 'stopped') {
            if (s.kind !== 'start') {
              expect(out.command).toBeNull();
              expect(state.kind).toBe('stopped');
            }
          }

          if (s.kind === 'stop') {
            expect(state.kind).toBe('stopped');
            expect(out.command).toBeNull();
            lastStart = null;
            awaitingAnswer = false;
            continue;
          }

          const fromWake = s.kind === 'wakeSucceeded';

          if (s.kind === 'tick' || s.kind === 'visible') {
            const expected =
              prev.kind === 'running' && !prev.playing && !prev.quiet && now >= prev.nextDueAt;
            expect(out.command === 'screech').toBe(expected);
          } else if (fromWake) {
            expect(out.command === 'screech').toBe(prev.kind === 'running' && prev.quiet);
          } else {
            expect(out.command).toBeNull();
          }

          if (out.command === 'screech') {
            // No burst: a second command cannot appear before the host answers the first.
            expect(awaitingAnswer).toBe(false);
            awaitingAnswer = true;

            // The host answers at once with started or skipped.
            if (s.skip) {
              state = beaconStep(state, { type: 'screechSkipped', now, random: s.random }).state;
            } else {
              if (!fromWake && lastStart !== null) {
                expect(now - lastStart).toBeGreaterThanOrEqual(15000);
              }
              lastStart = now;
              state = beaconStep(state, { type: 'screechStarted', now, random: s.random }).state;
            }
            awaitingAnswer = false;
          }

          if (s.kind === 'start' && prev.kind === 'stopped') {
            lastStart = null;
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
