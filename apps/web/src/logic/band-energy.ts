/** Lowest frequency (Hz) of the ggwave tone band. */
export const SCREECH_BAND_LOW_HZ = 1875;
/** Highest frequency (Hz) of the ggwave tone band. */
export const SCREECH_BAND_HIGH_HZ = 6400;

function positiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** Centre frequency in Hz of an analyser bin: index * sampleRate / fftSize. */
export function binFrequency(index: number, sampleRate: number, fftSize: number): number {
  return (index * sampleRate) / fftSize;
}

/**
 * Energy of the tone band, in [0, 1]: the mean magnitude of bins with
 * lowHz <= frequency <= highHz, divided by 255. Non-finite magnitudes count
 * as 0. No bins in band, or an invalid sample rate or FFT size, gives 0.
 */
export function bandEnergy(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  lowHz: number,
  highHz: number,
): number {
  if (!positiveFinite(sampleRate) || !positiveFinite(fftSize)) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    const f = binFrequency(i, sampleRate, fftSize);
    if (f >= lowHz && f <= highHz) {
      const m = magnitudes[i];
      sum += Number.isFinite(m) ? m : 0;
      count++;
    }
  }
  if (count === 0) return 0;
  const energy = sum / count / 255;
  if (!Number.isFinite(energy)) return 0;
  return Math.min(1, Math.max(0, energy));
}

/** Number of lit meter steps: round(clamp(energy, 0, 1) * steps). Non-finite energy gives 0. */
export function meterSteps(energy: number, steps = 5): number {
  if (!Number.isFinite(energy)) return 0;
  return Math.round(Math.min(1, Math.max(0, energy)) * steps);
}
