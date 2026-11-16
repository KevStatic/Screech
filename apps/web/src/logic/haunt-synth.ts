/**
 * Procedural haunting sounds. Pure functions: sample rate and seed in,
 * mono Float32Array out. No clock, no random source, no browser API.
 */

import {
  assertSampleRate,
  createPrng,
  finishLoop,
  finishSound,
  hannRise,
  highpass4,
  lowpass8,
  runCascade,
  type Prng,
} from './haunt-dsp';

export const HAUNT_CEILING_HZ = 1800;
export const MIN_SAMPLE_RATE = 22050;
export const MAX_SAMPLE_RATE = 96000;
export const HAUNT_PEAK_LIMIT = 0.2;
export const DRONE_PEAK_LIMIT = 0.1;
export const MIN_ATTACK_MS = 30;
export const MAX_STEP = 0.05;
export const OUT_OF_BAND_LIMIT = 0.0001;
/** Highest low-pass corner (8th order) any noise component may use. */
export const SYNTH_CORNER_MAX_HZ = 800;
export const PHONE_BAND_LOW_HZ = 300;
export const PHONE_BAND_HIGH_HZ = 1500;
export const PHONE_BAND_MIN_SHARE = 0.5;
/** No sine partial may sit above this frequency. */
export const PARTIAL_LIMIT_HZ = 1400;
export const DRONE_PARTIAL_MAX_HZ = 880;
/** Highest harmonic for the thud and the awaken sound. */
export const HARMONIC_MAX_HZ = 1100;
/** 1 / DRONE_LOOP_SEC. Every drone partial is a multiple of this. */
export const LOOP_BASE_HZ = 0.25;
export const DRONE_LOOP_SEC = 4;

export const SOUND_NAMES = [
  'awaken',
  'drone',
  'card-flip',
  'candle-crackle',
  'planchette-scrape',
  'whisper',
  'broken-crackle',
  'sealed-thud',
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];
export type OneShotName = Exclude<SoundName, 'drone'>;

export interface SoundSpec {
  readonly minSec: number;
  readonly maxSec: number;
  readonly peak: number;
}

export const SOUND_SPECS: Readonly<Record<SoundName, SoundSpec>> = {
  awaken: { minSec: 1.5, maxSec: 3.0, peak: 0.19 },
  drone: { minSec: 2.0, maxSec: 8.0, peak: 0.085 },
  'card-flip': { minSec: 0.15, maxSec: 0.5, peak: 0.14 },
  'candle-crackle': { minSec: 0.15, maxSec: 0.6, peak: 0.1 },
  'planchette-scrape': { minSec: 0.15, maxSec: 0.5, peak: 0.1 },
  whisper: { minSec: 0.8, maxSec: 2.0, peak: 0.1 },
  'broken-crackle': { minSec: 0.4, maxSec: 1.2, peak: 0.16 },
  'sealed-thud': { minSec: 0.4, maxSec: 1.5, peak: 0.19 },
};

/** One seed per one-shot that is not per-letter. The drone has no seed (0). */
export const FIXED_SEEDS: Readonly<Record<Exclude<OneShotName, 'planchette-scrape'>, number>> = {
  awaken: 0x0a3a4e17,
  'card-flip': 0x1c0de5a1,
  'candle-crackle': 0x2b1f7c93,
  whisper: 0x3d5e91b7,
  'broken-crackle': 0x4a6c08d5,
  'sealed-thud': 0x5e7b2f49,
};

export interface FilterCorners {
  readonly highpass4: number | null;
  readonly lowpass8: number | null;
}

/** One entry per noise component of each sound. Sounds without noise have none. */
export const FILTER_CORNERS: Readonly<Record<SoundName, readonly FilterCorners[]>> = {
  awaken: [],
  drone: [],
  'card-flip': [{ highpass4: 350, lowpass8: 800 }],
  'candle-crackle': [{ highpass4: 450, lowpass8: 800 }],
  'planchette-scrape': [{ highpass4: 350, lowpass8: 800 }],
  whisper: [{ highpass4: 300, lowpass8: 800 }],
  'broken-crackle': [{ highpass4: 450, lowpass8: 800 }],
  'sealed-thud': [{ highpass4: 300, lowpass8: 600 }],
};

// ---- Recipe tables (read by the generators and by the tests) ----

const THUNK_PARTIALS: readonly number[] = [90, 180, 360, 540, 720, 900, 1080];
const THUNK_WEIGHTS: readonly number[] = [0.3, 0.5, 1.0, 0.8, 0.5, 0.3, 0.15];
const HUM_START_HZ = 110;
const HUM_END_HZ = 170;
const HUM_WEIGHTS: readonly number[] = [0.2, 0.5, 1.0, 0.8, 0.5, 0.3];
const TICK_MIN_HZ = 520;
const TICK_MAX_HZ = 720;
const TICK_JITTER_SEC = 0.015;

export const AWAKEN_LAYOUT = {
  totalSec: 2.4,
  thunk: { startSec: 0, endSec: 0.5 },
  hum: { startSec: 0.3, endSec: 1.7 },
  tickStartsSec: [1.8, 2.0, 2.2, 2.35] as readonly number[],
  tickDurSec: 0.012,
} as const;

const DRONE_PARTIALS: readonly number[] = [110, 220, 330, 330.5, 440, 550, 660, 770, 880];
const DRONE_WEIGHTS: readonly number[] = [0.25, 0.5, 1.0, 0.8, 0.8, 0.5, 0.5, 0.3, 0.25];

const BUZZ_PARTIALS: readonly number[] = [360, 480, 600, 720];
const THUD_PARTIALS: readonly number[] = [110, 220, 330, 440, 550, 660, 770, 880, 990, 1100];

function humPartials(): readonly number[] {
  const out: number[] = [];
  for (let k = 1; k <= HUM_WEIGHTS.length; k++) out.push(k * HUM_START_HZ, k * HUM_END_HZ);
  return out;
}

/** Every sine frequency the generator can use, in Hz. */
export function partialsOf(name: SoundName): readonly number[] {
  switch (name) {
    case 'awaken':
      return [...THUNK_PARTIALS, ...humPartials(), TICK_MIN_HZ, TICK_MAX_HZ];
    case 'drone':
      return DRONE_PARTIALS;
    case 'broken-crackle':
      return BUZZ_PARTIALS;
    case 'sealed-thud':
      return THUD_PARTIALS;
    case 'card-flip':
    case 'candle-crackle':
    case 'planchette-scrape':
    case 'whisper':
      return [];
  }
}

function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

function sampleCount(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/** Thunk, rising hum, then four ticks. */
export function generateAwaken(sampleRate: number, seed: number): Float32Array {
  assertSampleRate(sampleRate);
  const prng = createPrng(seed);
  const n = sampleCount(AWAKEN_LAYOUT.totalSec, sampleRate);
  const raw = new Float64Array(n);
  const twoPi = 2 * Math.PI;

  // Thunk: decaying harmonics of 90 Hz, level 1.
  const thunkN = Math.min(n, sampleCount(AWAKEN_LAYOUT.thunk.endSec, sampleRate));
  const thunkNorm = sum(THUNK_WEIGHTS);
  const thunkRise = Math.round(0.045 * sampleRate);
  for (let i = 0; i < thunkN; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let p = 0; p < THUNK_PARTIALS.length; p++) {
      v += (THUNK_WEIGHTS[p] as number) * Math.sin(twoPi * (THUNK_PARTIALS[p] as number) * t);
    }
    raw[i] = (v / thunkNorm) * Math.exp(-t / 0.12) * hannRise(thunkRise, i);
  }

  // Hum: fundamental glides 110 to 170 Hz; phase is the integral of frequency.
  const humStart = sampleCount(AWAKEN_LAYOUT.hum.startSec, sampleRate);
  const humN = Math.min(n, sampleCount(AWAKEN_LAYOUT.hum.endSec, sampleRate)) - humStart;
  const humDur = AWAKEN_LAYOUT.hum.endSec - AWAKEN_LAYOUT.hum.startSec;
  const humNorm = sum(HUM_WEIGHTS);
  const humRise = Math.round(0.08 * sampleRate);
  const humFall = Math.round(0.1 * sampleRate);
  for (let j = 0; j < humN; j++) {
    const tau = j / sampleRate;
    const phi = twoPi * (HUM_START_HZ * tau + ((HUM_END_HZ - HUM_START_HZ) / (2 * humDur)) * tau * tau);
    let v = 0;
    for (let k = 0; k < HUM_WEIGHTS.length; k++) {
      v += (HUM_WEIGHTS[k] as number) * Math.sin((k + 1) * phi);
    }
    const env = hannRise(humRise, j) * hannRise(humFall, humN - 1 - j);
    const idx = humStart + j;
    raw[idx] = (raw[idx] as number) + 0.55 * (v / humNorm) * env;
  }

  // Ticks: short Hann-windowed sine bursts with seeded pitch and start jitter.
  const tickN = sampleCount(AWAKEN_LAYOUT.tickDurSec, sampleRate);
  for (const nominal of AWAKEN_LAYOUT.tickStartsSec) {
    const hz = TICK_MIN_HZ + prng.next() * (TICK_MAX_HZ - TICK_MIN_HZ);
    const start = sampleCount(nominal + prng.next() * TICK_JITTER_SEC, sampleRate);
    for (let i = 0; i < tickN && start + i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((twoPi * i) / (tickN - 1));
      raw[start + i] = (raw[start + i] as number) + 0.3 * w * Math.sin((twoPi * hz * i) / sampleRate);
    }
  }

  return finishSound(raw, sampleRate, { peak: SOUND_SPECS.awaken.peak, attackMs: 45, releaseMs: 60 });
}

/** Seamless 4 second loop plus one sample (4 * rate + 1). Has no randomness. */
export function generateDrone(sampleRate: number): Float32Array {
  assertSampleRate(sampleRate);
  const n = DRONE_LOOP_SEC * sampleRate + 1;
  const raw = new Float64Array(n);
  const twoPi = 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let p = 0; p < DRONE_PARTIALS.length; p++) {
      v += (DRONE_WEIGHTS[p] as number) * Math.sin(twoPi * (DRONE_PARTIALS[p] as number) * t);
    }
    const s = Math.sin((Math.PI * t) / DRONE_LOOP_SEC);
    raw[i] = v * (0.35 + 0.65 * s * s);
  }
  return finishLoop(raw, sampleRate, SOUND_SPECS.drone.peak);
}

const TWO_PI = 2 * Math.PI;

function assertCorners(c: FilterCorners): { hp: number; lp: number } {
  if (c.highpass4 === null || c.lowpass8 === null) {
    throw new RangeError('Noise components need both filter corners');
  }
  return { hp: c.highpass4, lp: c.lowpass8 };
}

/** White noise through highpass4 then lowpass8, scaled to a peak of exactly 1. */
function bandNoise(n: number, sampleRate: number, corners: FilterCorners, prng: Prng): Float64Array {
  const { hp, lp } = assertCorners(corners);
  const white = new Float64Array(n);
  for (let i = 0; i < n; i++) white[i] = prng.next() * 2 - 1;
  const out = runCascade(lowpass8(lp, sampleRate), runCascade(highpass4(hp, sampleRate), white));
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i] as number));
  if (m > 0) for (let i = 0; i < n; i++) out[i] = (out[i] as number) / m;
  return out;
}

function noiseCorners(name: SoundName, index = 0): FilterCorners {
  const c = FILTER_CORNERS[name][index];
  if (c === undefined) throw new RangeError(`No noise component ${index} for ${name}`);
  return c;
}

function noiseSound(name: OneShotName, sampleRate: number, seed: number, seconds: number, attackMs: number, releaseMs: number, shape: (x: Float64Array, prng: Prng) => void): Float32Array {
  assertSampleRate(sampleRate);
  const prng = createPrng(seed);
  const n = sampleCount(seconds, sampleRate);
  const x = bandNoise(n, sampleRate, noiseCorners(name), prng);
  shape(x, prng);
  return finishSound(x, sampleRate, { peak: SOUND_SPECS[name].peak, attackMs, releaseMs });
}

/** Noise with a 45 ms rise and exponential decay. */
export function generateCardFlip(sampleRate: number, seed: number): Float32Array {
  return noiseSound('card-flip', sampleRate, seed, 0.3, 45, 60, (x) => {
    const rise = Math.round(0.045 * sampleRate);
    for (let i = 0; i < x.length; i++) {
      x[i] = (x[i] as number) * hannRise(rise, i) * Math.exp(-i / sampleRate / 0.08);
    }
  });
}

/** 5 to 8 short Hann-windowed noise pops between 25 and 300 ms. */
export function generateCandleCrackle(sampleRate: number, seed: number): Float32Array {
  return noiseSound('candle-crackle', sampleRate, seed, 0.35, 40, 60, (x, prng) => {
    const pops = 5 + Math.floor(prng.next() * 4);
    const gate = new Float64Array(x.length);
    for (let p = 0; p < pops; p++) {
      const start = sampleCount(0.025 + prng.next() * 0.26, sampleRate);
      const len = sampleCount(0.008 + prng.next() * 0.004, sampleRate);
      const amp = 0.3 + 0.7 * prng.next();
      for (let i = 0; i < len && start + i < x.length; i++) {
        const w = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (len - 1));
        gate[start + i] = Math.max(gate[start + i] as number, amp * w);
      }
    }
    for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * (gate[i] as number);
  });
}

/** Noise with a seeded 35 to 60 Hz stick-slip modulation. */
export function generatePlanchetteScrape(sampleRate: number, seed: number): Float32Array {
  return noiseSound('planchette-scrape', sampleRate, seed, 0.18, 40, 50, (x, prng) => {
    const f = 35 + prng.next() * 25;
    const phase = prng.next() * TWO_PI;
    for (let i = 0; i < x.length; i++) {
      x[i] = (x[i] as number) * (0.6 + 0.4 * Math.sin(TWO_PI * f * (i / sampleRate) + phase));
    }
  });
}

/** Slow swell of noise with 6 to 9 Hz breath flutter at 15 percent depth. */
export function generateWhisper(sampleRate: number, seed: number): Float32Array {
  return noiseSound('whisper', sampleRate, seed, 1.4, 500, 600, (x, prng) => {
    const f = 6 + prng.next() * 3;
    const phase = prng.next() * TWO_PI;
    for (let i = 0; i < x.length; i++) {
      x[i] = (x[i] as number) * (1 + 0.15 * Math.sin(TWO_PI * f * (i / sampleRate) + phase));
    }
  });
}

/** Noise gated by 5 to 8 dropouts, over a mains buzz at 360, 480, 600 and 720 Hz. */
export function generateBrokenCrackle(sampleRate: number, seed: number): Float32Array {
  assertSampleRate(sampleRate);
  const prng = createPrng(seed);
  const n = sampleCount(0.8, sampleRate);
  const x = bandNoise(n, sampleRate, noiseCorners('broken-crackle'), prng);
  const ramp = sampleCount(0.008, sampleRate);
  const gate = new Float64Array(n).fill(1);
  const drops = 5 + Math.floor(prng.next() * 4);
  for (let d = 0; d < drops; d++) {
    const len = sampleCount(0.03 + prng.next() * 0.07, sampleRate);
    const start = Math.floor(prng.next() * Math.max(1, n - len));
    for (let i = 0; i < len && start + i < n; i++) {
      const edge = hannRise(ramp, i) * hannRise(ramp, len - 1 - i);
      gate[start + i] = Math.min(gate[start + i] as number, 1 - edge);
    }
  }
  const weights = [1, 0.8, 0.6, 0.4];
  const norm = sum(weights);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let buzz = 0;
    for (let p = 0; p < BUZZ_PARTIALS.length; p++) {
      buzz += (weights[p] as number) * Math.sin(TWO_PI * (BUZZ_PARTIALS[p] as number) * t);
    }
    x[i] = (x[i] as number) * (gate[i] as number) + 0.15 * (buzz / norm);
  }
  return finishSound(x, sampleRate, { peak: SOUND_SPECS['broken-crackle'].peak, attackMs: 40, releaseMs: 60 });
}

const THUD_WEIGHTS: readonly number[] = [0.3, 0.5, 1.0, 0.9, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18];

/** Harmonics of 110 Hz with a 40 ms rise, 0.25 s decay and a quiet noise body. */
export function generateSealedThud(sampleRate: number, seed: number): Float32Array {
  assertSampleRate(sampleRate);
  const prng = createPrng(seed);
  const n = sampleCount(0.9, sampleRate);
  const body = bandNoise(n, sampleRate, noiseCorners('sealed-thud'), prng);
  const norm = sum(THUD_WEIGHTS);
  const rise = Math.round(0.04 * sampleRate);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (let p = 0; p < THUD_PARTIALS.length; p++) {
      v += (THUD_WEIGHTS[p] as number) * Math.sin(TWO_PI * (THUD_PARTIALS[p] as number) * t);
    }
    x[i] = ((v / norm) * hannRise(rise, i) + 0.08 * (body[i] as number)) * Math.exp(-t / 0.25);
  }
  return finishSound(x, sampleRate, { peak: SOUND_SPECS['sealed-thud'].peak, attackMs: 40, releaseMs: 80 });
}

/** The drone ignores the seed. */
export function generateSound(name: SoundName, sampleRate: number, seed: number): Float32Array {
  switch (name) {
    case 'awaken':
      return generateAwaken(sampleRate, seed);
    case 'drone':
      return generateDrone(sampleRate);
    case 'card-flip':
      return generateCardFlip(sampleRate, seed);
    case 'candle-crackle':
      return generateCandleCrackle(sampleRate, seed);
    case 'planchette-scrape':
      return generatePlanchetteScrape(sampleRate, seed);
    case 'whisper':
      return generateWhisper(sampleRate, seed);
    case 'broken-crackle':
      return generateBrokenCrackle(sampleRate, seed);
    case 'sealed-thud':
      return generateSealedThud(sampleRate, seed);
  }
}

/** Seed for one scrape. Depends only on the 0-based letter index. */
export function scrapeSeed(letterIndex: number): number {
  return (Math.imul(letterIndex + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
}
