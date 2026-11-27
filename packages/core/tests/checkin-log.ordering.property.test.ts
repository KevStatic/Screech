import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addCheckIn,
  EMPTY_CHECKIN_LOG,
  listCheckIns,
  type CheckIn,
  type CheckinLog,
} from '../src/checkin-log.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 11: Checkin_Log ordering
// **Validates: Requirements 3.6**
describe('Property 11: Checkin_Log ordering', () => {
  const BASE_MS = Date.UTC(2026, 9, 31, 23, 0, 0, 0);

  // A narrow time range makes equal `at` values common, so ties are exercised.
  const atArb = fc.integer({ min: 0, max: 5 }).map((n) => new Date(BASE_MS + n * 1000).toISOString());
  const deviceIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 32, maxLength: 32 })
    .map((chars) => chars.join(''));
  const nameArb = fc.string({ minLength: 1, maxLength: 8 });
  const checkInArb: fc.Arbitrary<CheckIn> = fc.record({
    name: nameArb,
    deviceId: deviceIdArb,
    at: atArb,
  });

  function build(entries: readonly CheckIn[]): { log: CheckinLog; accepted: CheckIn[] } {
    let log = EMPTY_CHECKIN_LOG;
    const accepted: CheckIn[] = [];
    for (const entry of entries) {
      const result = addCheckIn(log, entry);
      log = result.log;
      if (result.isNew) accepted.push(result.checkIn);
    }
    return { log, accepted };
  }

  it('returns an empty list for an empty log', () => {
    expect(listCheckIns(EMPTY_CHECKIN_LOG)).toEqual([]);
  });

  it('sorts ascending by at and keeps insertion order for equal at', () => {
    fc.assert(
      fc.property(fc.array(checkInArb, { maxLength: 30 }), (entries) => {
        const { log, accepted } = build(entries);
        const listed = listCheckIns(log);

        // Reference: stable sort of the accepted entries by time.
        const expected = accepted
          .map((entry, index) => ({ entry, index }))
          .sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at) || a.index - b.index)
          .map((x) => x.entry);

        expect(listed).toEqual(expected);

        // Direct statement of the property.
        const insertionIndex = new Map(accepted.map((e, i) => [e.deviceId, i]));
        for (let i = 1; i < listed.length; i += 1) {
          const prev = listed[i - 1] as CheckIn;
          const cur = listed[i] as CheckIn;
          const dt = Date.parse(prev.at) - Date.parse(cur.at);
          expect(dt).toBeLessThanOrEqual(0);
          if (dt === 0) {
            expect(insertionIndex.get(prev.deviceId) as number).toBeLessThan(
              insertionIndex.get(cur.deviceId) as number,
            );
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
