import { describe, it, expect } from 'vitest';
import { beaconInterval, countdownSeconds } from '../../src/logic/beacon-schedule';

describe('beaconInterval', () => {
  it('maps 0 to 15000', () => expect(beaconInterval(0)).toBe(15000));
  it('maps 0.5 to a value inside the range', () => {
    const v = beaconInterval(0.5);
    expect(v).toBeGreaterThanOrEqual(15000);
    expect(v).toBeLessThanOrEqual(20000);
  });
  it('maps the largest number below 1 to at most 20000', () => {
    const v = beaconInterval(1 - Number.EPSILON / 2);
    expect(v).toBeGreaterThan(15000);
    expect(v).toBeLessThanOrEqual(20000);
  });
  it('falls back to 15000 for NaN, 1 and -1', () => {
    expect(beaconInterval(NaN)).toBe(15000);
    expect(beaconInterval(1)).toBe(15000);
    expect(beaconInterval(-1)).toBe(15000);
  });
});

describe('countdownSeconds', () => {
  it('is 0 at equal times', () => expect(countdownSeconds(1000, 1000)).toBe(0));
  it('is 0 one millisecond after the due time', () => expect(countdownSeconds(1000, 1001)).toBe(0));
  it('is 1 one millisecond before the due time', () => expect(countdownSeconds(1001, 1000)).toBe(1));
  it('is 20 at 20000 ms before the due time', () => expect(countdownSeconds(21000, 1000)).toBe(20));
});
