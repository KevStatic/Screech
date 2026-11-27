import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHECKIN_LOG,
  addCheckIn,
  listCheckIns,
  soulCount,
  type CheckIn,
  type CheckinLog,
} from '../src/checkin-log';

const dev = (n: number): string => n.toString(16).padStart(32, '0');
const ci = (n: number, name: string, at: string): CheckIn => ({ name, deviceId: dev(n), at });

function addAll(entries: readonly CheckIn[]): CheckinLog {
  return entries.reduce((log, e) => addCheckIn(log, e).log, EMPTY_CHECKIN_LOG);
}

describe('checkin-log', () => {
  it('the empty log has no entries and zero souls', () => {
    expect(listCheckIns(EMPTY_CHECKIN_LOG)).toEqual([]);
    expect(soulCount(EMPTY_CHECKIN_LOG)).toBe(0);
  });

  it('adding to the empty log is new and does not mutate it', () => {
    const entry = ci(1, 'Ada', '2026-10-31T23:00:00.000Z');
    const res = addCheckIn(EMPTY_CHECKIN_LOG, entry);
    expect(res.isNew).toBe(true);
    expect(res.checkIn).toEqual(entry);
    expect(soulCount(res.log)).toBe(1);
    expect(soulCount(EMPTY_CHECKIN_LOG)).toBe(0);
  });

  it('a repeat with a different name and an earlier time keeps the first record', () => {
    const first = ci(1, 'Ada', '2026-10-31T23:00:00.000Z');
    const repeat = ci(1, 'Grace', '2026-10-31T22:00:00.000Z');
    const log1 = addCheckIn(EMPTY_CHECKIN_LOG, first).log;
    const res = addCheckIn(log1, repeat);
    expect(res.isNew).toBe(false);
    expect(res.checkIn).toEqual(first);
    expect(res.log).toBe(log1);
    expect(soulCount(res.log)).toBe(1);
    expect(listCheckIns(res.log)).toEqual([first]);
  });

  it('different devices with the same name are both stored', () => {
    const log = addAll([
      ci(1, 'Ada', '2026-10-31T23:00:00.000Z'),
      ci(2, 'Ada', '2026-10-31T23:00:01.000Z'),
    ]);
    expect(soulCount(log)).toBe(2);
  });

  it('lists in ascending time order', () => {
    const a = ci(1, 'A', '2026-10-31T23:00:03.000Z');
    const b = ci(2, 'B', '2026-10-31T23:00:01.000Z');
    const c = ci(3, 'C', '2026-10-31T23:00:02.000Z');
    expect(listCheckIns(addAll([a, b, c]))).toEqual([b, c, a]);
  });

  it('equal times keep insertion order', () => {
    const at = '2026-10-31T23:00:00.000Z';
    const a = ci(3, 'A', at);
    const b = ci(1, 'B', at);
    const c = ci(2, 'C', at);
    expect(listCheckIns(addAll([a, b, c]))).toEqual([a, b, c]);
  });
});
