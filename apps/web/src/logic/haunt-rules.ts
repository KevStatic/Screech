import type { Screen } from './flow';
import type { OneShotName, SoundName } from './haunt-synth';
import { isLetter, SPELL_MAX_CHARS } from './ouija';

export interface GateInputs {
  readonly awakened: boolean;
  readonly contextRunning: boolean;
  readonly soundOn: boolean;
  readonly quiet: boolean;
}

/** True only when every condition allows a sound. */
export function soundGate(i: GateInputs): boolean {
  return i.awakened && i.contextRunning && i.soundOn && !i.quiet;
}

export interface QuietInputs {
  readonly screen: Screen;
  readonly captureActive: boolean;
  readonly playbackRunning: boolean;
}

/** Quiet while listening, sending, capturing or playing a transmission. */
export function quietState(i: QuietInputs): boolean {
  return i.screen === 'listen' || i.screen === 'screeching' || i.captureActive || i.playbackRunning;
}

export const DEDUPE_WINDOW_MS = 30;
export type LastAccepted = Readonly<Partial<Record<OneShotName, number>>>;
export interface DedupeDecision {
  readonly accept: boolean;
  readonly next: LastAccepted;
}

export function decideOneShot(last: LastAccepted, name: OneShotName, nowMs: number): DedupeDecision {
  if (!Number.isFinite(nowMs)) return { accept: false, next: last };
  const prev = last[name];
  if (prev !== undefined) {
    const elapsed = nowMs - prev;
    if (elapsed >= 0 && elapsed < DEDUPE_WINDOW_MS) return { accept: false, next: last };
  }
  return { accept: true, next: { ...last, [name]: nowMs } };
}

export const CRACKLE_LIMIT_MS = 400;

export function crackleAllowed(lastStartMs: number | null, nowMs: number): boolean {
  if (lastStartMs === null) return true;
  const diff = nowMs - lastStartMs;
  return diff >= CRACKLE_LIMIT_MS || diff < 0;
}

/** The first reading is a baseline, not a change. NaN counts as null. */
export function candleChanged(prev: number | null, next: number | null): boolean {
  const a = prev === null || Number.isNaN(prev) ? null : prev;
  const b = next === null || Number.isNaN(next) ? null : next;
  return a !== null && a !== b;
}

export interface ScrapeRequest {
  readonly letterIndex: number;
  readonly delayMs: number;
}

export const SCRAPE_STAGGER_MS = 30;

export function scrapePlan(
  chars: readonly string[],
  shownBefore: number,
  shownAfter: number,
): readonly ScrapeRequest[] {
  const clamp = (n: number): number =>
    Number.isFinite(n) ? Math.min(chars.length, Math.max(0, Math.floor(n))) : 0;
  const from = clamp(shownBefore);
  const to = clamp(shownAfter);
  if (to <= from) return [];
  let letters = 0;
  for (let i = 0; i < from; i += 1) {
    if (isLetter(chars[i] as string)) letters += 1;
  }
  const out: ScrapeRequest[] = [];
  for (let i = from; i < to; i += 1) {
    if (!isLetter(chars[i] as string)) continue;
    if (letters < SPELL_MAX_CHARS) {
      out.push({ letterIndex: letters, delayMs: out.length * SCRAPE_STAGGER_MS });
    }
    letters += 1;
  }
  return out;
}

export function bufferKey(name: SoundName, sampleRate: number, seed: number): string {
  return `${name}@${sampleRate}#${seed}`;
}
