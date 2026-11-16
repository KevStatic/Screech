import { describe, it, expect } from 'vitest';
import {
  SOUND_HINT_KEY,
  SOUND_HINT_TEXT,
  isIosDevice,
  shouldShowSoundHint,
  parseHintSeen,
  serializeHintSeen,
} from '../../src/logic/sound-hint';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('constants', () => {
  it('uses the specified key and text', () => {
    expect(SOUND_HINT_KEY).toBe('screech.sound-hint');
    expect(SOUND_HINT_TEXT).toBe('On iPhone, the silent switch mutes these sounds.');
  });
});

describe('isIosDevice', () => {
  it('is false for a real Mac with 0 touch points', () => {
    expect(isIosDevice(MAC_UA, 'MacIntel', 0)).toBe(false);
  });
  it('is false for a Mac with 1 touch point', () => {
    expect(isIosDevice(MAC_UA, 'MacIntel', 1)).toBe(false);
  });
  it('is true for an iPad in desktop mode', () => {
    expect(isIosDevice(MAC_UA, 'MacIntel', 5)).toBe(true);
  });
  it('is true when the user agent names iPhone, iPad or iPod', () => {
    expect(isIosDevice(IPHONE_UA, 'iPhone', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0)', '', 0)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPod touch)', '', 0)).toBe(true);
  });
  it('treats non-finite touch points as 0', () => {
    expect(isIosDevice(MAC_UA, 'MacIntel', Number.NaN)).toBe(false);
    expect(isIosDevice(MAC_UA, 'MacIntel', Number.POSITIVE_INFINITY)).toBe(false);
  });
  it('is false for a non-Mac platform with touch points', () => {
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false);
  });
});

describe('parseHintSeen / serializeHintSeen', () => {
  it('counts any saved string as seen, including empty', () => {
    expect(parseHintSeen('1')).toBe(true);
    expect(parseHintSeen('')).toBe(true);
    expect(parseHintSeen('anything')).toBe(true);
  });
  it('is false for null and undefined', () => {
    expect(parseHintSeen(null)).toBe(false);
    expect(parseHintSeen(undefined)).toBe(false);
  });
  it('serializes to "1", which parses as seen', () => {
    expect(serializeHintSeen()).toBe('1');
    expect(parseHintSeen(serializeHintSeen())).toBe(true);
  });
});

describe('shouldShowSoundHint', () => {
  const base = { soundOn: true, ios: true, awakened: true, savedValue: null };
  it('is true when all conditions hold', () => {
    expect(shouldShowSoundHint(base)).toBe(true);
  });
  it('is false when sound is off', () => {
    expect(shouldShowSoundHint({ ...base, soundOn: false })).toBe(false);
  });
  it('is false when not iOS', () => {
    expect(shouldShowSoundHint({ ...base, ios: false })).toBe(false);
  });
  it('is false before the Awaken tap', () => {
    expect(shouldShowSoundHint({ ...base, awakened: false })).toBe(false);
  });
  it('is false once a value is saved, even an empty one', () => {
    expect(shouldShowSoundHint({ ...base, savedValue: '1' })).toBe(false);
    expect(shouldShowSoundHint({ ...base, savedValue: '' })).toBe(false);
  });
});
