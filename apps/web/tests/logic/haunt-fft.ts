// Test-only spectrum helpers for the haunting-sounds specs.
// Lives in tests/ on purpose: never import this from src (not in the shipped bundle).

export interface Spectrum {
  readonly sampleRate: number;
  /** Padded FFT length (a power of two). */
  readonly size: number;
  /** Bin spacing in Hz (sampleRate / size). */
  readonly binHz: number;
  /** Power (squared magnitude) for bins 0..size/2 inclusive. */
  readonly power: Float64Array;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || n < 1 || (n & (n - 1)) !== 0) {
    throw new RangeError('fft length must be a power of two');
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      const ti = im[i] as number;
      re[i] = re[j] as number;
      im[i] = im[j] as number;
      re[j] = tr;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Hann-windowed, zero-padded power spectrum (bins 0..N/2). */
export function powerSpectrum(samples: ArrayLike<number>, sampleRate: number): Spectrum {
  const len = samples.length;
  const size = nextPowerOfTwo(Math.max(len, 2));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const denom = Math.max(len - 1, 1);
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
    re[i] = (samples[i] as number) * w;
  }
  fftInPlace(re, im);
  const bins = size / 2 + 1;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    const r = re[k] as number;
    const m = im[k] as number;
    power[k] = r * r + m * m;
  }
  return { sampleRate, size, binHz: sampleRate / size, power };
}

function sumPower(s: Spectrum, from: number, to: number): number {
  let total = 0;
  for (let k = Math.max(0, from); k <= Math.min(to, s.power.length - 1); k++) {
    total += s.power[k] as number;
  }
  return total;
}

/** Share of total power in bins strictly above ceilingHz. 0 for silence. */
export function outOfBandRatio(
  samples: ArrayLike<number>,
  sampleRate: number,
  ceilingHz: number,
): number {
  const s = powerSpectrum(samples, sampleRate);
  const total = sumPower(s, 0, s.power.length - 1);
  if (total === 0) return 0;
  const first = Math.floor(ceilingHz / s.binHz + 1e-9) + 1;
  return sumPower(s, first, s.power.length - 1) / total;
}

/** Share of total power in bins whose centre lies in [lowHz, highHz]. 0 for silence. */
export function bandShare(
  samples: ArrayLike<number>,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const s = powerSpectrum(samples, sampleRate);
  const total = sumPower(s, 0, s.power.length - 1);
  if (total === 0) return 0;
  const lo = Math.ceil(lowHz / s.binHz - 1e-9);
  const hi = Math.floor(highHz / s.binHz + 1e-9);
  return sumPower(s, lo, hi) / total;
}

/** Largest share of total power held by any single band `bandWidthHz` wide. */
export function peakBandShare(
  samples: ArrayLike<number>,
  sampleRate: number,
  bandWidthHz = 10,
): number {
  const s = powerSpectrum(samples, sampleRate);
  const total = sumPower(s, 0, s.power.length - 1);
  if (total === 0) return 0;
  const width = Math.max(1, Math.round(bandWidthHz / s.binHz));
  let window = sumPower(s, 0, width - 1);
  let best = window;
  for (let k = width; k < s.power.length; k++) {
    window += (s.power[k] as number) - (s.power[k - width] as number);
    if (window > best) best = window;
  }
  return Math.min(1, best / total);
}

/** Frequency (Hz) of the largest bin in [startSec, endSec). */
export function dominantFrequency(
  samples: ArrayLike<number>,
  sampleRate: number,
  startSec: number,
  endSec: number,
): number {
  const from = Math.max(0, Math.floor(startSec * sampleRate));
  const to = Math.min(samples.length, Math.floor(endSec * sampleRate));
  const slice = new Float64Array(Math.max(0, to - from));
  for (let i = 0; i < slice.length; i++) slice[i] = samples[from + i] as number;
  const s = powerSpectrum(slice, sampleRate);
  let best = 0;
  let bestK = 0;
  for (let k = 0; k < s.power.length; k++) {
    const p = s.power[k] as number;
    if (p > best) {
      best = p;
      bestK = k;
    }
  }
  return bestK * s.binHz;
}

const cache = new Map<string, Spectrum>();

export function spectrumKey(name: string, sampleRate: number, seed: number): string {
  return `${name}|${sampleRate}|${seed}`;
}

/** Compute once per key, then return the same object. */
export function cachedSpectrum(key: string, compute: () => Spectrum): Spectrum {
  const hit = cache.get(key);
  if (hit) return hit;
  const fresh = compute();
  cache.set(key, fresh);
  return fresh;
}

export function clearSpectrumCache(): void {
  cache.clear();
}
