import { describe, expect, it } from 'vitest';
import {
  AWAKEN_LAYOUT,
  DRONE_LOOP_SEC,
  DRONE_PARTIAL_MAX_HZ,
  DRONE_PEAK_LIMIT,
  FILTER_CORNERS,
  FIXED_SEEDS,
  HARMONIC_MAX_HZ,
  HAUNT_CEILING_HZ,
  HAUNT_PEAK_LIMIT,
  LOOP_BASE_HZ,
  MAX_SAMPLE_RATE,
  MAX_STEP,
  MIN_ATTACK_MS,
  MIN_SAMPLE_RATE,
  OUT_OF_BAND_LIMIT,
  PARTIAL_LIMIT_HZ,
  PHONE_BAND_HIGH_HZ,
  PHONE_BAND_LOW_HZ,
  PHONE_BAND_MIN_SHARE,
  SOUND_NAMES,
  SOUND_SPECS,
  SYNTH_CORNER_MAX_HZ,
  generateAwaken,
  generateBrokenCrackle,
  generateCandleCrackle,
  generateCardFlip,
  generateDrone,
  generatePlanchetteScrape,
  generateSealedThud,
  generateSound,
  generateWhisper,
  partialsOf,
  scrapeSeed,
  type SoundName,
} from '../../src/logic/haunt-synth';
import { bandShare } from './haunt-fft';

const RATE_44K = 44100;
const RATE_48K = 48000;
const RATES = [RATE_44K, RATE_48K] as const;
const SEED = 12345;

function seedFor(name: SoundName): number {
  if (name === 'drone') return 0;
  if (name === 'planchette-scrape') return scrapeSeed(0);
  return FIXED_SEEDS[name];
}

function peakOf(x: Float32Array): number {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}

describe('constants', () => {
  it('have the designed values', () => {
    expect(HAUNT_CEILING_HZ).toBe(1800);
    expect(MIN_SAMPLE_RATE).toBe(22050);
    expect(MAX_SAMPLE_RATE).toBe(96000);
    expect(HAUNT_PEAK_LIMIT).toBe(0.2);
    expect(DRONE_PEAK_LIMIT).toBe(0.1);
    expect(MIN_ATTACK_MS).toBe(30);
    expect(MAX_STEP).toBe(0.05);
    expect(OUT_OF_BAND_LIMIT).toBe(0.0001);
    expect(SYNTH_CORNER_MAX_HZ).toBe(800);
    expect(PHONE_BAND_LOW_HZ).toBe(300);
    expect(PHONE_BAND_HIGH_HZ).toBe(1500);
    expect(PHONE_BAND_MIN_SHARE).toBe(0.5);
    expect(PARTIAL_LIMIT_HZ).toBe(1400);
    expect(DRONE_PARTIAL_MAX_HZ).toBe(880);
    expect(HARMONIC_MAX_HZ).toBe(1100);
    expect(LOOP_BASE_HZ).toBe(0.25);
    expect(DRONE_LOOP_SEC).toBe(4);
    expect(LOOP_BASE_HZ).toBe(1 / DRONE_LOOP_SEC);
  });

  it('lists the eight sounds', () => {
    expect([...SOUND_NAMES]).toEqual([
      'awaken',
      'drone',
      'card-flip',
      'candle-crackle',
      'planchette-scrape',
      'whisper',
      'broken-crackle',
      'sealed-thud',
    ]);
  });

  it('gives each fixed seed a distinct whole number', () => {
    const seeds = Object.values(FIXED_SEEDS);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const s of seeds) expect(Number.isInteger(s)).toBe(true);
  });

  it('has awaken layout with three ordered parts and four ticks', () => {
    expect(AWAKEN_LAYOUT.tickStartsSec).toHaveLength(4);
    expect(AWAKEN_LAYOUT.thunk.startSec).toBeLessThan(AWAKEN_LAYOUT.hum.startSec);
    expect(AWAKEN_LAYOUT.hum.endSec).toBeLessThan(AWAKEN_LAYOUT.tickStartsSec[0] as number);
  });

  it('keeps every noise corner at or below SYNTH_CORNER_MAX_HZ', () => {
    for (const name of SOUND_NAMES) {
      for (const c of FILTER_CORNERS[name]) {
        expect(c.lowpass8).not.toBeNull();
        expect(c.lowpass8 as number).toBeLessThanOrEqual(SYNTH_CORNER_MAX_HZ);
      }
    }
  });
});

describe('generators, one example each', () => {
  const rate = RATE_44K;

  it('generateAwaken lasts its layout length', () => {
    const x = generateAwaken(rate, FIXED_SEEDS.awaken);
    expect(x).toBeInstanceOf(Float32Array);
    expect(x.length).toBe(Math.round(AWAKEN_LAYOUT.totalSec * rate));
  });

  it('generateDrone has 4 * rate + 1 samples', () => {
    const x = generateDrone(rate);
    expect(x.length).toBe(DRONE_LOOP_SEC * rate + 1);
  });

  it('generateCardFlip lasts 0.3 s', () => {
    expect(generateCardFlip(rate, FIXED_SEEDS['card-flip']).length).toBe(Math.round(0.3 * rate));
  });

  it('generateCandleCrackle lasts 0.35 s', () => {
    expect(generateCandleCrackle(rate, FIXED_SEEDS['candle-crackle']).length).toBe(Math.round(0.35 * rate));
  });

  it('generatePlanchetteScrape lasts 0.18 s', () => {
    expect(generatePlanchetteScrape(rate, scrapeSeed(0)).length).toBe(Math.round(0.18 * rate));
  });

  it('generateWhisper lasts 1.4 s', () => {
    expect(generateWhisper(rate, FIXED_SEEDS.whisper).length).toBe(Math.round(1.4 * rate));
  });

  it('generateBrokenCrackle lasts 0.8 s', () => {
    expect(generateBrokenCrackle(rate, FIXED_SEEDS['broken-crackle']).length).toBe(Math.round(0.8 * rate));
  });

  it('generateSealedThud lasts 0.9 s', () => {
    expect(generateSealedThud(rate, FIXED_SEEDS['sealed-thud']).length).toBe(Math.round(0.9 * rate));
  });

  it('generateSound dispatches to the matching generator', () => {
    expect(generateSound('awaken', rate, SEED)).toEqual(generateAwaken(rate, SEED));
    expect(generateSound('drone', rate, SEED)).toEqual(generateDrone(rate));
    expect(generateSound('card-flip', rate, SEED)).toEqual(generateCardFlip(rate, SEED));
    expect(generateSound('candle-crackle', rate, SEED)).toEqual(generateCandleCrackle(rate, SEED));
    expect(generateSound('planchette-scrape', rate, SEED)).toEqual(generatePlanchetteScrape(rate, SEED));
    expect(generateSound('whisper', rate, SEED)).toEqual(generateWhisper(rate, SEED));
    expect(generateSound('broken-crackle', rate, SEED)).toEqual(generateBrokenCrackle(rate, SEED));
    expect(generateSound('sealed-thud', rate, SEED)).toEqual(generateSealedThud(rate, SEED));
  });

  it('scrapeSeed is a whole unsigned number that differs by letter', () => {
    expect(scrapeSeed(0)).toBe(scrapeSeed(0));
    expect(scrapeSeed(0)).not.toBe(scrapeSeed(1));
    for (const i of [0, 1, 29, 1000]) {
      const s = scrapeSeed(i);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('partialsOf returns no partials for pure-noise sounds', () => {
    for (const name of ['card-flip', 'candle-crackle', 'planchette-scrape', 'whisper'] as const) {
      expect(partialsOf(name)).toEqual([]);
    }
  });
});

describe('bad sample rates', () => {
  const bad = [0, 22049, 96001, 44100.5, Number.NaN, Number.POSITIVE_INFINITY, -48000];

  it('every generator throws a RangeError naming the value and the range', () => {
    for (const rate of bad) {
      for (const name of SOUND_NAMES) {
        let caught: unknown;
        try {
          generateSound(name, rate, SEED);
        } catch (e) {
          caught = e;
        }
        expect(caught, `${name} at ${String(rate)}`).toBeInstanceOf(RangeError);
        const message = (caught as RangeError).message;
        expect(message).toContain(String(rate));
        expect(message).toContain(String(MIN_SAMPLE_RATE));
        expect(message).toContain(String(MAX_SAMPLE_RATE));
      }
    }
  });

  it('accepts the range ends', () => {
    expect(() => generateCardFlip(MIN_SAMPLE_RATE, SEED)).not.toThrow();
    expect(() => generateCardFlip(MAX_SAMPLE_RATE, SEED)).not.toThrow();
  });
});

describe('peak table', () => {
  it('has every peak at most 0.19, under HAUNT_PEAK_LIMIT', () => {
    for (const name of SOUND_NAMES) {
      expect(SOUND_SPECS[name].peak, name).toBeLessThanOrEqual(0.19);
      expect(SOUND_SPECS[name].peak, name).toBeLessThan(HAUNT_PEAK_LIMIT);
    }
    expect(SOUND_SPECS.drone.peak).toBeLessThan(DRONE_PEAK_LIMIT);
  });

  it('is reached by the generated samples (never exceeded)', () => {
    for (const name of SOUND_NAMES) {
      const x = generateSound(name, RATE_48K, seedFor(name));
      expect(peakOf(x), name).toBeLessThanOrEqual(SOUND_SPECS[name].peak + 1e-6);
    }
  });
});

describe('partials', () => {
  it('drone partials are multiples of LOOP_BASE_HZ and at most DRONE_PARTIAL_MAX_HZ', () => {
    for (const hz of partialsOf('drone')) {
      const ratio = hz / LOOP_BASE_HZ;
      expect(Math.abs(ratio - Math.round(ratio)), `${hz} Hz`).toBeLessThan(1e-9);
      expect(hz).toBeLessThanOrEqual(DRONE_PARTIAL_MAX_HZ);
    }
  });

  it('no sound has a partial above PARTIAL_LIMIT_HZ', () => {
    for (const name of SOUND_NAMES) {
      for (const hz of partialsOf(name)) {
        expect(hz, `${name} ${hz} Hz`).toBeLessThanOrEqual(PARTIAL_LIMIT_HZ);
      }
    }
  });

  it('thud and awaken harmonics stay at or below HARMONIC_MAX_HZ', () => {
    for (const hz of partialsOf('sealed-thud')) expect(hz).toBeLessThanOrEqual(HARMONIC_MAX_HZ);
    for (const hz of partialsOf('awaken')) expect(hz).toBeLessThanOrEqual(HARMONIC_MAX_HZ);
  });
});

describe('fixed-seed Phone_Band_Share', () => {
  for (const rate of RATES) {
    for (const name of SOUND_NAMES) {
      it(`${name} at ${rate} Hz has at least PHONE_BAND_MIN_SHARE in the phone band`, () => {
        const x = generateSound(name, rate, seedFor(name));
        const share = bandShare(x, rate, PHONE_BAND_LOW_HZ, PHONE_BAND_HIGH_HZ);
        expect(share, `${name} ${rate} Hz share ${share.toFixed(3)}`).toBeGreaterThanOrEqual(PHONE_BAND_MIN_SHARE);
      });
    }
  }
});
