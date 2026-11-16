import { describe, expect, it } from 'vitest';
import { SOUND_KEY, parseSound, serializeSound } from '../../src/logic/sound-pref';

describe('SOUND_KEY', () => {
  it('is screech.sound and differs from the exorcise key', () => {
    expect(SOUND_KEY).toBe('screech.sound');
    expect(SOUND_KEY).not.toBe('screech.exorcise');
  });
});

describe('parseSound', () => {
  it('"1" is on', () => {
    expect(parseSound('1')).toBe(true);
  });
  it('"0" is off', () => {
    expect(parseSound('0')).toBe(false);
  });
  it.each(['', 'false', 'off', ' 0', '00'])('%j is on', (raw) => {
    expect(parseSound(raw)).toBe(true);
  });
  it('null and undefined are on', () => {
    expect(parseSound(null)).toBe(true);
    expect(parseSound(undefined)).toBe(true);
  });
});

describe('serializeSound', () => {
  it('writes 1 for on and 0 for off', () => {
    expect(serializeSound(true)).toBe('1');
    expect(serializeSound(false)).toBe('0');
  });
  it('round trips', () => {
    expect(parseSound(serializeSound(true))).toBe(true);
    expect(parseSound(serializeSound(false))).toBe(false);
  });
});
