import { describe, expect, it } from 'vitest';
import {
  SPELL_MAX_CHARS,
  SPELL_MAX_MS,
  SPELL_RATE_CPS,
  isLetter,
  spellProgress,
  spellShown,
} from '../../src/logic/ouija';

const cpLength = (s: string): number => [...s].length;

describe('spellProgress', () => {
  it('exposes the schedule constants', () => {
    expect(SPELL_RATE_CPS).toBe(12);
    expect(SPELL_MAX_CHARS).toBe(30);
    expect(SPELL_MAX_MS).toBe(2500);
  });

  it('an empty value is done at once', () => {
    expect(spellProgress(0, 0)).toEqual({ count: 0, done: true });
    expect(spellProgress(1000, cpLength(''))).toEqual({ count: 0, done: true });
  });

  it('a 1-character value starts at 0 and is done after one step', () => {
    expect(spellProgress(0, 1)).toEqual({ count: 0, done: false });
    expect(spellProgress(83, 1)).toEqual({ count: 0, done: false });
    expect(spellProgress(84, 1)).toEqual({ count: 1, done: true });
  });

  it('spells at 12 characters per second', () => {
    expect(spellProgress(500, 20)).toEqual({ count: 6, done: false });
    expect(spellProgress(1000, 20)).toEqual({ count: 12, done: false });
  });

  it('exactly 30 characters finishes at 2500 ms', () => {
    expect(spellProgress(2499, 30)).toEqual({ count: 29, done: false });
    expect(spellProgress(2500, 30)).toEqual({ count: 30, done: true });
  });

  it('31+ characters cap at 30 until 2500 ms, then show everything', () => {
    expect(spellProgress(2400, 31)).toEqual({ count: 28, done: false });
    expect(spellProgress(2499, 100)).toEqual({ count: 29, done: false });
    expect(spellProgress(2500, 31)).toEqual({ count: 31, done: true });
    expect(spellProgress(2500, 100)).toEqual({ count: 100, done: true });
    expect(spellProgress(60000, 100)).toEqual({ count: 100, done: true });
  });

  it('counts astral and emoji characters as one code point each', () => {
    const value = '👻'.repeat(5);
    expect(value.length).toBe(10); // UTF-16 units
    const len = cpLength(value);
    expect(len).toBe(5);
    expect(spellProgress(0, len)).toEqual({ count: 0, done: false });
    expect(spellProgress(250, len)).toEqual({ count: 3, done: false });
    expect(spellProgress(417, len)).toEqual({ count: 5, done: true });
  });

  it('negative and NaN elapsed behave like 0', () => {
    expect(spellProgress(-50, 10)).toEqual({ count: 0, done: false });
    expect(spellProgress(Number.NaN, 10)).toEqual({ count: 0, done: false });
  });

  it('bad lengths are treated as empty', () => {
    expect(spellProgress(0, Number.NaN)).toEqual({ count: 0, done: true });
    expect(spellProgress(0, -4)).toEqual({ count: 0, done: true });
  });
});

describe('isLetter', () => {
  it('treats whitespace as not a Letter and everything else as a Letter', () => {
    expect(isLetter(' ')).toBe(false);
    expect(isLetter('\n')).toBe(false);
    expect(isLetter('\t')).toBe(false);
    expect(isLetter('a')).toBe(true);
    expect(isLetter('7')).toBe(true);
    expect(isLetter('.')).toBe(true);
    expect(isLetter('👻')).toBe(true);
  });
});

describe('spellShown', () => {
  const chars = (s: string): string[] => [...s];

  it('spaces do not consume steps', () => {
    // 250 ms -> 3 Letters of "a b c d"; shown ends right after "c"
    expect(spellShown(250, chars('a b c d'))).toEqual({ shown: 5, letters: 3, done: false });
  });

  it('count 0 shows nothing, even with leading whitespace', () => {
    expect(spellShown(0, chars('  ab'))).toEqual({ shown: 0, letters: 0, done: false });
  });

  it('done shows trailing whitespace', () => {
    expect(spellShown(2500, chars('ab  '))).toEqual({ shown: 4, letters: 2, done: true });
    expect(spellShown(1000, chars('ab  '))).toEqual({ shown: 4, letters: 2, done: true });
  });

  it('text without whitespace equals spellProgress', () => {
    const text = chars('hello👻world');
    for (const ms of [0, 100, 250, 500, 800, 2500]) {
      const p = spellProgress(ms, text.length);
      expect(spellShown(ms, text)).toEqual({ shown: p.count, letters: p.count, done: p.done });
    }
  });

  it('empty chars are done at once', () => {
    expect(spellShown(0, [])).toEqual({ shown: 0, letters: 0, done: true });
  });

  it('whitespace-only text is done at once', () => {
    expect(spellShown(0, chars('   '))).toEqual({ shown: 3, letters: 0, done: true });
  });
});
