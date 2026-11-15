import { describe, expect, it } from 'vitest';
import { EXORCISE_KEY, parseExorcise, resolveReducedMotion, serializeExorcise } from '../../src/logic/motion';

describe('parseExorcise', () => {
  it('only the exact string "1" is on', () => {
    expect(parseExorcise('1')).toBe(true);
  });
  it.each([null, undefined, '', '0', 'true', ' 1', '1 ', 'on', 'yes', '01'])('%j is off', (raw) => {
    expect(parseExorcise(raw)).toBe(false);
  });
});

describe('serializeExorcise', () => {
  it('writes "1" for on and "0" for off', () => {
    expect(serializeExorcise(true)).toBe('1');
    expect(serializeExorcise(false)).toBe('0');
  });
  it('round-trips through parseExorcise', () => {
    expect(parseExorcise(serializeExorcise(true))).toBe(true);
    expect(parseExorcise(serializeExorcise(false))).toBe(false);
  });
});

describe('resolveReducedMotion', () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('toggle=%s system=%s gives %s', (toggle, system, expected) => {
    expect(resolveReducedMotion(toggle, system)).toBe(expected);
  });
});

describe('EXORCISE_KEY', () => {
  it('is the storage key', () => {
    expect(EXORCISE_KEY).toBe('screech.exorcise');
  });
});
