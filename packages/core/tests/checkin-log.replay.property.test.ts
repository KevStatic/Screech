import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHECKIN_LOG,
  addCheckIn,
  type CheckIn,
  type CheckinLog,
} from '../src/checkin-log.js';
import { NUM_RUNS } from './helpers.js';

// A small device pool so sequences contain repeated devices as well as new ones.
const deviceIdArb = fc
  .integer({ min: 0, max: 40 })
  .map((n) => n.toString(16).padStart(32, '0'));

const checkInArb: fc.Arbitrary<CheckIn> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 32 }),
  deviceId: deviceIdArb,
  at: fc
    .date({ min: new Date('2026-01-01T00:00:00.000Z'), max: new Date('2027-01-01T00:00:00.000Z'), noInvalidDate: true })
    .map((d) => d.toISOString()),
});

const sequenceArb = fc.array(checkInArb, { minLength: 0, maxLength: 1000 });

function fold(log: CheckinLog, seq: readonly CheckIn[]): { log: CheckinLog; allRepeats: boolean } {
  let current = log;
  let allRepeats = true;
  for (const checkIn of seq) {
    const result = addCheckIn(current, checkIn);
    if (result.isNew) allRepeats = false;
    current = result.log;
  }
  return { log: current, allRepeats };
}

function snapshot(log: CheckinLog): { entries: [string, CheckIn][]; order: string[] } {
  return { entries: [...log.byDevice.entries()], order: [...log.order] };
}

describe('checkin log replay', () => {
  // Feature: seance, Property 10: Replaying a sequence is a no-op
  // **Validates: Requirements 3.4**
  it('a second pass leaves the log unchanged and reports every check-in as a repeat', () => {
    fc.assert(
      fc.property(sequenceArb, (seq) => {
        const first = fold(EMPTY_CHECKIN_LOG, seq);
        const before = snapshot(first.log);
        const second = fold(first.log, seq);
        expect(snapshot(second.log)).toEqual(before);
        expect(second.allRepeats).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
