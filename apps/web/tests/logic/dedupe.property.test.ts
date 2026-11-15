import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { dedupeStep, DEDUPE_WINDOW_MS, type DedupeState } from '../../src/logic/dedupe';

const eventsArb = fc
  .array(
    fc.record({
      key: fc.constantFrom('a', 'b', 'c', 'd'),
      delta: fc.oneof(fc.integer({ min: 0, max: 12000 }), fc.constantFrom(0, 4999, 5000, 5001)),
    }),
    { maxLength: 60 },
  )
  .map((evs) => {
    let t = 0;
    return evs.map((e) => {
      t += e.delta;
      return { key: e.key, now: t };
    });
  });

describe('dedupe properties', () => {
  /**
   * Feature: spirit-box-app, Property 21: Duplicate screens are suppressed for 5 seconds
   * **Validates: Requirements 12.12, 12.13**
   */
  it('Feature: spirit-box-app, Property 21: shown iff never shown or window elapsed; suppressed does not extend; state pruned', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        let state: DedupeState = new Map();
        const lastShown = new Map<string, number>();
        for (const { key, now } of events) {
          const prev = lastShown.get(key);
          const expected = prev === undefined || now - prev >= DEDUPE_WINDOW_MS;
          const res = dedupeStep(state, key, now);
          expect(res.show).toBe(expected);
          if (expected) lastShown.set(key, now);
          state = res.state;
          for (const shownAt of state.values()) {
            expect(now - shownAt).toBeLessThan(DEDUPE_WINDOW_MS);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
