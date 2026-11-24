import { describe, it, expect } from 'vitest';
import { airtimeSeconds, longClueNote, LONG_CLUE_THRESHOLD_BYTES } from '../../src/logic/airtime';

describe('airtimeSeconds', () => {
  it('is within 1 s of 2.3 s at 26 bytes', () => {
    expect(Math.abs(airtimeSeconds(26) - 2.3)).toBeLessThanOrEqual(1);
  });
  it('is within 1 s of 4 s at 53 bytes', () => {
    expect(Math.abs(airtimeSeconds(53) - 4)).toBeLessThanOrEqual(1);
  });
  it('is within 1 s of 9.3 s at 140 bytes', () => {
    expect(Math.abs(airtimeSeconds(140) - 9.3)).toBeLessThanOrEqual(1);
  });
  it('gives 1 for 0 bytes', () => {
    expect(airtimeSeconds(0)).toBe(1);
  });
  it('gives 0 for NaN, -1 and Infinity', () => {
    expect(airtimeSeconds(NaN)).toBe(0);
    expect(airtimeSeconds(-1)).toBe(0);
    expect(airtimeSeconds(Infinity)).toBe(0);
  });
});

describe('longClueNote', () => {
  it('is null at exactly 100 bytes', () => {
    expect(LONG_CLUE_THRESHOLD_BYTES).toBe(100);
    expect(longClueNote(100)).toBeNull();
  });
  it('returns the note at 101 bytes', () => {
    expect(longClueNote(101)).toBe(
      `Long clue: players must stay close for about ${airtimeSeconds(101)} s.`,
    );
  });
});
