/**
 * Pure DSP helpers for the haunting sounds: seeded PRNG, biquad cascades,
 * Hann windows and the finishers that make every sound safe to play.
 * No clock, no random source, no browser API.
 */

export const SAMPLE_RATE_MIN = 22050;
export const SAMPLE_RATE_MAX = 96000;
/** Largest allowed difference between two neighbouring samples after finishing. */
export const STEP_GUARD = 0.045;
/** Shortest Hann rise or fall, in milliseconds. */
export const MIN_ENVELOPE_MS = 40;

const ATTACK_THRESHOLD = 0.9;
const ATTACK_MIN_MS = 35;
const ATTACK_REGION_MS = 60;
const ATTACK_MAX_PASSES = 8;

export interface Prng {
  /** Uniform value in [0, 1). */
  next(): number;
}

/** mulberry32 over `seed >>> 0`. Any integer seed is accepted. */
export function createPrng(seed: number): Prng {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`Seed must be a whole number, got ${String(seed)}`);
  }
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function assertSampleRate(sampleRate: number): void {
  if (!Number.isInteger(sampleRate) || sampleRate < SAMPLE_RATE_MIN || sampleRate > SAMPLE_RATE_MAX) {
    throw new RangeError(
      `Sample rate ${String(sampleRate)} is outside the supported range ${SAMPLE_RATE_MIN} to ${SAMPLE_RATE_MAX} Hz (whole numbers only)`,
    );
  }
}

/** One normalised biquad section (a0 = 1). */
export interface BiquadSection {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

export interface BiquadCascade {
  readonly sections: readonly BiquadSection[];
}

const LOWPASS8_Q: readonly number[] = [0.5098, 0.6013, 0.9, 2.5629];
const HIGHPASS4_Q: readonly number[] = [0.5412, 1.3066];

function assertCorner(corner: number, sampleRate: number): void {
  assertSampleRate(sampleRate);
  if (!Number.isFinite(corner) || corner <= 0 || corner >= sampleRate / 2) {
    throw new RangeError(`Filter corner ${String(corner)} Hz must be above 0 and below half of ${sampleRate} Hz`);
  }
}

function section(kind: 'low' | 'high', corner: number, sampleRate: number, q: number): BiquadSection {
  const w0 = (2 * Math.PI * corner) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = kind === 'low' ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = kind === 'low' ? 1 - cos : -(1 + cos);
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** 8th-order Butterworth low-pass from four RBJ sections. */
export function lowpass8(corner: number, sampleRate: number): BiquadCascade {
  assertCorner(corner, sampleRate);
  return { sections: LOWPASS8_Q.map((q) => section('low', corner, sampleRate, q)) };
}

/** 4th-order Butterworth high-pass from two RBJ sections. */
export function highpass4(corner: number, sampleRate: number): BiquadCascade {
  assertCorner(corner, sampleRate);
  return { sections: HIGHPASS4_Q.map((q) => section('high', corner, sampleRate, q)) };
}

/** Runs the cascade over `x` with fresh double-precision state. Returns a new array. */
export function runCascade(c: BiquadCascade, x: Float64Array): Float64Array {
  let current: Float64Array = x;
  for (const s of c.sections) {
    const out = new Float64Array(current.length);
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < current.length; i++) {
      const input = current[i] as number;
      const y = s.b0 * input + z1;
      z1 = s.b1 * input - s.a1 * y + z2;
      z2 = s.b2 * input - s.a2 * y;
      out[i] = y;
    }
    current = out;
  }
  return current === x ? Float64Array.from(x) : current;
}

/** Hann rise: 0 at i = 0, 1 at i = n, clamped outside. */
export function hannRise(n: number, i: number): number {
  if (n <= 0) return 1;
  if (i <= 0) return 0;
  if (i >= n) return 1;
  return 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}

export interface FinishOptions {
  readonly peak: number;
  readonly attackMs: number;
  readonly releaseMs: number;
}

function assertFinite(x: ArrayLike<number>, what: string): void {
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i] as number)) {
      throw new RangeError(`${what} has a non-finite value at sample ${i}`);
    }
  }
}

function assertPeak(peak: number): void {
  if (!Number.isFinite(peak) || peak <= 0) {
    throw new RangeError(`Peak must be a positive number, got ${String(peak)}`);
  }
}

function maxAbs(x: Float64Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i] as number);
    if (a > m) m = a;
  }
  return m;
}

function scaleToPeak(x: Float64Array, peak: number): void {
  const m = maxAbs(x);
  if (m === 0) return;
  const k = peak / m;
  for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * k;
}

function zeroEdges(x: Float64Array): void {
  if (x.length === 0) return;
  x[0] = 0;
  x[x.length - 1] = 0;
}

function maxStepOf(x: Float64Array): number {
  let m = 0;
  for (let i = 1; i < x.length; i++) {
    const d = Math.abs((x[i] as number) - (x[i - 1] as number));
    if (d > m) m = d;
  }
  return m;
}

function applyStepGuard(x: Float64Array): void {
  const step = maxStepOf(x);
  if (step > STEP_GUARD) {
    const k = STEP_GUARD / step;
    for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * k;
  }
}

function toFloat32(x: Float64Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] as number;
  assertFinite(out, 'Finished sound');
  return out;
}

function attackGuard(x: Float64Array, sampleRate: number, peak: number): void {
  const earlyLimit = Math.floor((ATTACK_MIN_MS * sampleRate) / 1000);
  const region = Math.min(x.length, Math.floor((ATTACK_REGION_MS * sampleRate) / 1000));
  const threshold = ATTACK_THRESHOLD * peak;
  for (let pass = 0; pass < ATTACK_MAX_PASSES; pass++) {
    let first = -1;
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i] as number) >= threshold) {
        first = i;
        break;
      }
    }
    if (first < 0 || first >= earlyLimit) return;
    // Smooth halving: gain 0.5 at the start, easing back to 1 at the region end.
    for (let i = 0; i < region; i++) {
      x[i] = (x[i] as number) * (0.5 + 0.5 * hannRise(region, i));
    }
    scaleToPeak(x, peak);
    zeroEdges(x);
  }
}

/** Envelope, scale to `peak`, zero edges, attack guard, step guard, Float32. */
export function finishSound(raw: Float64Array, sampleRate: number, o: FinishOptions): Float32Array {
  assertSampleRate(sampleRate);
  assertPeak(o.peak);
  assertFinite(raw, 'Raw sound');
  const x = Float64Array.from(raw);
  const n = x.length;
  const rise = Math.round((Math.max(o.attackMs, MIN_ENVELOPE_MS) * sampleRate) / 1000);
  const fall = Math.round((Math.max(o.releaseMs, MIN_ENVELOPE_MS) * sampleRate) / 1000);
  for (let i = 0; i < n; i++) {
    x[i] = (x[i] as number) * hannRise(rise, i) * hannRise(fall, n - 1 - i);
  }
  scaleToPeak(x, o.peak);
  zeroEdges(x);
  attackGuard(x, sampleRate, o.peak);
  applyStepGuard(x);
  return toFloat32(x);
}

/** Loop finisher: no envelopes, scale to `peak`, zero edges, step guard, Float32. */
export function finishLoop(raw: Float64Array, sampleRate: number, peak: number): Float32Array {
  assertSampleRate(sampleRate);
  assertPeak(peak);
  assertFinite(raw, 'Raw loop');
  const x = Float64Array.from(raw);
  scaleToPeak(x, peak);
  zeroEdges(x);
  applyStepGuard(x);
  return toFloat32(x);
}
