import { describe, expect, it } from 'vitest';
import {
  bufferKey,
  candleChanged,
  crackleAllowed,
  decideOneShot,
  quietState,
  scrapePlan,
  soundGate,
} from '../../src/logic/haunt-rules';

describe('soundGate', () => {
  const on = { awakened: true, contextRunning: true, soundOn: true, quiet: false };
  it('opens only when every input allows', () => {
    expect(soundGate(on)).toBe(true);
    expect(soundGate({ ...on, awakened: false })).toBe(false);
    expect(soundGate({ ...on, contextRunning: false })).toBe(false);
    expect(soundGate({ ...on, soundOn: false })).toBe(false);
    expect(soundGate({ ...on, quiet: true })).toBe(false);
  });
});

describe('quietState', () => {
  const base = { screen: 'speak', captureActive: false, playbackRunning: false } as const;
  it('is quiet on listen, screeching, capture or playback', () => {
    expect(quietState(base)).toBe(false);
    expect(quietState({ ...base, screen: 'listen' })).toBe(true);
    expect(quietState({ ...base, screen: 'screeching' })).toBe(true);
    expect(quietState({ ...base, captureActive: true })).toBe(true);
    expect(quietState({ ...base, playbackRunning: true })).toBe(true);
    expect(quietState({ ...base, screen: 'reveal' })).toBe(false);
    for (const screen of ['hunt-setup', 'hunt-reveal', 'hunt-complete'] as const) {
      expect(quietState({ ...base, screen })).toBe(false);
      expect(quietState({ ...base, screen, beaconActive: false })).toBe(false);
      expect(quietState({ ...base, screen, beaconActive: true })).toBe(true);
    }
    expect(quietState({ ...base, beaconActive: true })).toBe(true);
  });
});

describe('decideOneShot', () => {
  it('refuses at 29 ms and accepts at 30 ms', () => {
    const first = decideOneShot({}, 'card-flip', 100);
    expect(first.accept).toBe(true);
    const at29 = decideOneShot(first.next, 'card-flip', 129);
    expect(at29.accept).toBe(false);
    expect(at29.next).toBe(first.next);
    expect(decideOneShot(first.next, 'card-flip', 130).accept).toBe(true);
  });
  it('accepts a negative elapsed time and refuses a non-finite one', () => {
    const first = decideOneShot({}, 'card-flip', 100);
    expect(decideOneShot(first.next, 'card-flip', 90).accept).toBe(true);
    expect(decideOneShot({}, 'card-flip', Number.NaN).accept).toBe(false);
  });
  it('keeps names independent', () => {
    const first = decideOneShot({}, 'card-flip', 100);
    const other = decideOneShot(first.next, 'whisper', 100);
    expect(other.accept).toBe(true);
    expect(other.next).toEqual({ 'card-flip': 100, whisper: 100 });
  });
});

describe('crackleAllowed', () => {
  it('allows null, 400 ms and negative, refuses 399 ms', () => {
    expect(crackleAllowed(null, 5)).toBe(true);
    expect(crackleAllowed(0, 399)).toBe(false);
    expect(crackleAllowed(0, 400)).toBe(true);
    expect(crackleAllowed(500, 100)).toBe(true);
  });
});

describe('candleChanged', () => {
  it('treats the first reading as a baseline', () => {
    expect(candleChanged(null, 5)).toBe(false);
    expect(candleChanged(null, null)).toBe(false);
    expect(candleChanged(5, 5)).toBe(false);
    expect(candleChanged(5, 6)).toBe(true);
    expect(candleChanged(5, null)).toBe(true);
  });
  it('treats NaN as null', () => {
    expect(candleChanged(Number.NaN, 5)).toBe(false);
    expect(candleChanged(5, Number.NaN)).toBe(true);
    expect(candleChanged(Number.NaN, Number.NaN)).toBe(false);
  });
});

describe('scrapePlan', () => {
  it('skips spaces without shifting indexes', () => {
    expect(scrapePlan(['a', ' ', 'b'], 0, 3)).toEqual([
      { letterIndex: 0, delayMs: 0 },
      { letterIndex: 1, delayMs: 30 },
    ]);
  });
  it('counts letters before shownBefore', () => {
    expect(scrapePlan(['a', ' ', 'b', 'c'], 2, 4)).toEqual([
      { letterIndex: 1, delayMs: 0 },
      { letterIndex: 2, delayMs: 30 },
    ]);
  });
  it('gives nothing for empty or reversed ranges and clamps', () => {
    expect(scrapePlan(['a', 'b'], 1, 1)).toEqual([]);
    expect(scrapePlan(['a', 'b'], 2, 0)).toEqual([]);
    expect(scrapePlan(['a', 'b'], -5, 99)).toHaveLength(2);
  });
  it('stops at 30 letters', () => {
    const chars = Array.from({ length: 40 }, () => 'x');
    const plan = scrapePlan(chars, 0, 40);
    expect(plan).toHaveLength(30);
    expect(plan[29]).toEqual({ letterIndex: 29, delayMs: 870 });
    expect(scrapePlan(chars, 30, 40)).toEqual([]);
  });
});

describe('bufferKey', () => {
  it('formats and separates triples', () => {
    expect(bufferKey('awaken', 44100, 7)).toBe('awaken@44100#7');
    const keys = new Set([
      bufferKey('awaken', 44100, 7),
      bufferKey('awaken', 48000, 7),
      bufferKey('awaken', 44100, 8),
      bufferKey('whisper', 44100, 7),
    ]);
    expect(keys.size).toBe(4);
  });
});
