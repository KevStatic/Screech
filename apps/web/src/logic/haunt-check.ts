/**
 * Safety checks for generated haunting sounds. Pure: samples in, verdict out.
 * The player runs `checkSound` before it plays anything.
 */

import {
  DRONE_PEAK_LIMIT,
  HAUNT_PEAK_LIMIT,
  MAX_STEP,
  MIN_ATTACK_MS,
  SOUND_SPECS,
  type SoundName,
} from './haunt-synth';

/** The attack ends at the first sample at or above this share of the peak. */
const ATTACK_THRESHOLD = 0.9;

export interface SoundCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly peak: number;
  readonly attackMs: number;
  readonly maxStep: number;
}

/** Largest absolute sample value. 0 for an empty array. */
export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i] as number);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * Milliseconds from the start to the first sample whose magnitude reaches
 * 90 percent of the peak. 0 for an empty or silent array.
 */
export function attackTimeMs(samples: Float32Array, sampleRate: number): number {
  const peak = peakOf(samples);
  if (peak === 0) return 0;
  const threshold = ATTACK_THRESHOLD * peak;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i] as number) >= threshold) return (i * 1000) / sampleRate;
  }
  return 0;
}

/** Largest absolute difference between consecutive samples. */
export function maxStep(samples: Float32Array): number {
  let step = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs((samples[i] as number) - (samples[i - 1] as number));
    if (d > step) step = d;
  }
  return step;
}

function fmt(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(4))) : String(v);
}

export function checkSound(name: SoundName, samples: Float32Array, sampleRate: number): SoundCheck {
  const problems: string[] = [];
  const peak = peakOf(samples);
  const attackMs = attackTimeMs(samples, sampleRate);
  const step = maxStep(samples);

  if (samples.length === 0) {
    problems.push('sound has no samples');
  } else {
    const first = samples[0] as number;
    const last = samples[samples.length - 1] as number;
    if (first !== 0) problems.push(`first sample is ${fmt(first)}, not 0`);
    if (last !== 0) problems.push(`last sample is ${fmt(last)}, not 0`);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i] as number)) {
        problems.push(`sample ${i} is not a finite number`);
        break;
      }
    }
    if (peak === 0) problems.push('sound is silent');
  }

  if (peak > HAUNT_PEAK_LIMIT) {
    problems.push(`peak ${fmt(peak)} is above ${HAUNT_PEAK_LIMIT}`);
  }
  const specPeak = SOUND_SPECS[name].peak;
  // Samples are Float32, so compare against the table value rounded the same way.
  if (peak > Math.fround(specPeak)) {
    problems.push(`peak ${fmt(peak)} is above the ${name} limit ${specPeak}`);
  }
  if (samples.length > 0 && attackMs < MIN_ATTACK_MS) {
    problems.push(`attack ${fmt(attackMs)} ms is shorter than ${MIN_ATTACK_MS} ms`);
  }
  if (step > MAX_STEP) {
    problems.push(`step ${fmt(step)} is above ${MAX_STEP}`);
  }
  if (name === 'drone') {
    for (let i = 0; i < samples.length; i++) {
      if (!(Math.abs(samples[i] as number) < DRONE_PEAK_LIMIT)) {
        problems.push(`drone sample ${i} is ${fmt(samples[i] as number)}, not below ${DRONE_PEAK_LIMIT}`);
        break;
      }
    }
  }

  return { ok: problems.length === 0, problems, peak, attackMs, maxStep: step };
}
