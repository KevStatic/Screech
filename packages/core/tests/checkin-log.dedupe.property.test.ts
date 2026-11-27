import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addCheckIn,
  EMPTY_CHECKIN_LOG,
  soulCount,
  type CheckIn,
  type CheckinLog,
} from '../src/checkin-log.js';
import { NUM_RUNS } from './helpers.js';

// Feature: seance, Property 9: Checkin_Log dedupe invariant and first-write-wins
// **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.7**
describe('Property 9: Checkin_Log dedupe invariant and first-write-wins', () => {
  const hex32Arb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 32, maxLength: 32 })
    .map((chars) => chars.join(''));
  // A small pool of device ids so that repeats are common in long sequences.
  const deviceIdPoolArb = fc.array(hex32Arb, { minLength: 1, maxLength: 12 });
  const nameArb = fc.string({ minLength: 1, maxLength: 32 });
  const atArb = fc
    .date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2040-01-01T00:00:00.000Z'), noInvalidDate: true })
    .map((d) => d.toISOString());

  const sequenceArb: fc.Arbitrary<CheckIn[]> = deviceIdPoolArb.chain((pool) =>
    fc.array(
      fc.record({
        name: nameArb,
        deviceId: fc.constantFrom(...pool),
        at: atArb,
      }),
      { minLength: 0, maxLength: 1000 },
    ),
  );

  it('holds one entry per device, flags new/repeat correctly, and keeps the first write', () => {
    fc.assert(
      fc.property(sequenceArb, (sequence) => {
        let log: CheckinLog = EMPTY_CHECKIN_LOG;
        const first = new Map<string, CheckIn>();

        for (const checkIn of sequence) {
          const before = log;
          const sizeBefore = soulCount(before);
          const seen = first.has(checkIn.deviceId);
          const result = addCheckIn(before, checkIn);

          if (!seen) {
            first.set(checkIn.deviceId, checkIn);
            expect(result.isNew).toBe(true);
            expect(soulCount(result.log)).toBe(sizeBefore + 1);
            expect(result.checkIn).toEqual(checkIn);
          } else {
            expect(result.isNew).toBe(false);
            expect(soulCount(result.log)).toBe(sizeBefore);
            expect(result.log.byDevice.size).toBe(before.byDevice.size);
            expect(result.log.order).toEqual(before.order);
            expect(result.checkIn).toEqual(first.get(checkIn.deviceId));
          }
          log = result.log;
        }

        expect(log.byDevice.size).toBe(first.size);
        expect(log.order.length).toBe(first.size);
        expect(new Set(log.order).size).toBe(log.order.length);
        expect(soulCount(log)).toBe(first.size);
        for (const [deviceId, firstCheckIn] of first) {
          const stored = log.byDevice.get(deviceId);
          expect(stored?.name).toBe(firstCheckIn.name);
          expect(stored?.at).toBe(firstCheckIn.at);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('does not mutate the input log', () => {
    const a: CheckIn = { name: 'Ada', deviceId: 'a'.repeat(32), at: '2026-10-31T23:00:00.000Z' };
    const { log } = addCheckIn(EMPTY_CHECKIN_LOG, a);
    addCheckIn(log, { name: 'Bob', deviceId: 'b'.repeat(32), at: '2026-10-31T23:01:00.000Z' });
    expect(soulCount(log)).toBe(1);
    expect(soulCount(EMPTY_CHECKIN_LOG)).toBe(0);
  });
});
