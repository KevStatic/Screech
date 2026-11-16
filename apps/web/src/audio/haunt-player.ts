import { checkSound } from '../logic/haunt-check';
import {
  bufferKey,
  crackleAllowed,
  decideOneShot,
  soundGate,
  type LastAccepted,
} from '../logic/haunt-rules';
import {
  FIXED_SEEDS,
  generateSound,
  scrapeSeed,
  type OneShotName,
  type SoundName,
} from '../logic/haunt-synth';
import { currentContext, isRunning, type UnlockOutcome } from './session';

export const HAUNT_FAILURE_MESSAGE = 'The spirits are silent. This sound could not be made.';

/** Gain ramp length of a fade, in seconds. */
const FADE_SEC = 0.12;
/** Time after a fade starts at which the source is stopped, in seconds. */
const STOP_SEC = 0.13;
/** Drone gain ramp length, in seconds (at least 0.5 s, Requirement 3.8). */
const DRONE_RAMP_SEC = 0.8;
const DRONE_LEVEL = 1;
const ONE_SHOT_LEVEL = 1;
/** Extra time after the buffer length before the cleanup fallback runs, in ms. */
const END_FALLBACK_MS = 250;
/** Fallback cleanup after a fade, in ms (stop at 130 ms plus the same margin as `ended`). */
const FADE_FALLBACK_MS = STOP_SEC * 1000 + 100;
const SCRAPE_CACHE_CAP = 128;
const DRONE_SEED = 0;

export type PlayResult =
  | { readonly started: true }
  | {
      readonly started: false;
      readonly reason:
        | 'gate'
        | 'duplicate'
        | 'crackle-limit'
        | 'invalid-sound'
        | 'generator-failed'
        | 'no-context';
    };

export interface HauntPlayerDeps {
  /** The existing session context. Must never create one. */
  readonly getContext: () => AudioContext | null;
  readonly isRunning: () => boolean;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
  readonly setTimer: (fn: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
  readonly generate: (name: SoundName, sampleRate: number, seed: number) => Float32Array;
  /** Called at most once per player. */
  readonly onFailure: (message: string) => void;
}

export interface PlayOptions {
  readonly seed?: number;
  readonly delayMs?: number;
}

export interface HauntPlayer {
  update(inputs: { readonly quiet: boolean; readonly soundOn: boolean }): void;
  noteAwakenTap(outcome: UnlockOutcome): void;
  setDroneWanted(wanted: boolean): void;
  play(name: OneShotName, options?: PlayOptions): PlayResult;
  /** Fades every one-shot (screen exit, skip). The drone is untouched. */
  stopOneShots(): void;
  /** Fades one kind of one-shot (a skip stops the scrapes). */
  stopKind(name: OneShotName): void;
  dispose(): void;
}

interface Voice {
  readonly name: SoundName;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  fading: boolean;
  cleaned: boolean;
  fallbackTimer: number | null;
}

interface Pending {
  readonly name: OneShotName;
  timer: number;
}

function seedFor(name: SoundName, requested: number | undefined): number {
  if (name === 'drone') return DRONE_SEED;
  if (name === 'planchette-scrape') return requested ?? scrapeSeed(0);
  return FIXED_SEEDS[name];
}

export function createHauntPlayer(deps: HauntPlayerDeps): HauntPlayer {
  let awakened = false;
  let soundOn = true;
  let quiet = false;
  let droneWanted = false;
  let generation = 0;
  let lastAccepted: LastAccepted = {};
  let lastCrackleStart: number | null = null;
  let failureShown = false;
  let drone: Voice | null = null;
  const voices = new Set<Voice>();
  const pending = new Set<Pending>();
  const buffers = new Map<string, AudioBuffer>();
  const watched = new WeakMap<AudioContext, () => void>();
  let watchedContext: AudioContext | null = null;

  function gate(): boolean {
    return soundGate({ awakened, contextRunning: deps.isRunning(), soundOn, quiet });
  }

  function reportFailure(): void {
    if (failureShown) return;
    failureShown = true;
    try {
      deps.onFailure(HAUNT_FAILURE_MESSAGE);
    } catch {
      /* a failing notice must never break audio */
    }
  }

  /** Listen for `statechange` on the session context, once per context. */
  function watch(ctx: AudioContext): void {
    if (watched.has(ctx)) return;
    const listener = (): void => {
      try {
        reconcile();
      } catch {
        /* never throw out of an event */
      }
    };
    watched.set(ctx, listener);
    watchedContext = ctx;
    ctx.addEventListener('statechange', listener);
  }

  function cleanup(v: Voice): void {
    if (v.cleaned) return;
    v.cleaned = true;
    if (v.fallbackTimer !== null) {
      deps.clearTimer(v.fallbackTimer);
      v.fallbackTimer = null;
    }
    try {
      v.source.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      v.gain.disconnect();
    } catch {
      /* already disconnected */
    }
    voices.delete(v);
    if (drone === v) drone = null;
  }

  function track(v: Voice, fallbackMs: number | null): void {
    voices.add(v);
    v.source.addEventListener('ended', () => cleanup(v));
    if (fallbackMs !== null) v.fallbackTimer = deps.setTimer(() => cleanup(v), fallbackMs);
  }

  function fadeVoice(v: Voice, ctx: AudioContext): void {
    if (v.fading || v.cleaned) return;
    v.fading = true;
    const t = ctx.currentTime;
    try {
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + FADE_SEC);
    } catch {
      /* the stop below still silences it */
    }
    try {
      v.source.stop(t + STOP_SEC);
    } catch {
      /* already stopped */
    }
    if (v.fallbackTimer !== null) deps.clearTimer(v.fallbackTimer);
    v.fallbackTimer = deps.setTimer(() => cleanup(v), FADE_FALLBACK_MS);
  }

  function clearPending(filter?: OneShotName): void {
    for (const p of [...pending]) {
      if (filter !== undefined && p.name !== filter) continue;
      deps.clearTimer(p.timer);
      pending.delete(p);
    }
  }

  function fadeAll(): void {
    generation += 1;
    clearPending();
    const ctx = deps.getContext();
    drone = null;
    if (ctx === null) {
      for (const v of [...voices]) cleanup(v);
      return;
    }
    for (const v of [...voices]) fadeVoice(v, ctx);
  }

  /** Returns the cached buffer, or builds, checks and caches it. */
  function bufferFor(
    ctx: AudioContext,
    name: SoundName,
    seed: number,
  ): { readonly buffer: AudioBuffer } | { readonly reason: 'invalid-sound' | 'generator-failed' } {
    const sampleRate = ctx.sampleRate;
    const key = bufferKey(name, sampleRate, seed);
    const hit = buffers.get(key);
    if (hit !== undefined) return { buffer: hit };
    try {
      const samples = deps.generate(name, sampleRate, seed);
      if (!checkSound(name, samples, sampleRate).ok) return { reason: 'invalid-sound' };
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      if (name === 'planchette-scrape' && buffers.size >= SCRAPE_CACHE_CAP) {
        const oldest = buffers.keys().next();
        if (oldest.done !== true) buffers.delete(oldest.value);
      }
      buffers.set(key, buffer);
      return { buffer };
    } catch {
      reportFailure();
      return { reason: 'generator-failed' };
    }
  }

  function startOneShot(ctx: AudioContext, name: OneShotName, seed: number): PlayResult {
    const at = deps.now();
    const decision = decideOneShot(lastAccepted, name, at);
    if (!decision.accept) return { started: false, reason: 'duplicate' };
    if (name === 'candle-crackle' && !crackleAllowed(lastCrackleStart, at)) {
      return { started: false, reason: 'crackle-limit' };
    }
    const built = bufferFor(ctx, name, seed);
    if (!('buffer' in built)) return { started: false, reason: built.reason };
    const { buffer } = built;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    try {
      source = ctx.createBufferSource();
      gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = ONE_SHOT_LEVEL;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      try {
        source?.disconnect();
        gain?.disconnect();
      } catch {
        /* nothing to release */
      }
      reportFailure();
      return { started: false, reason: 'generator-failed' };
    }
    lastAccepted = decision.next;
    if (name === 'candle-crackle') lastCrackleStart = at;
    track(
      { name, source, gain, fading: false, cleaned: false, fallbackTimer: null },
      buffer.duration * 1000 + END_FALLBACK_MS,
    );
    return { started: true };
  }

  function startDrone(ctx: AudioContext): void {
    const built = bufferFor(ctx, 'drone', DRONE_SEED);
    if (!('buffer' in built)) return;
    const { buffer } = built;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    try {
      source = ctx.createBufferSource();
      gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = (buffer.length - 1) / ctx.sampleRate;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(DRONE_LEVEL, t + DRONE_RAMP_SEC);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      try {
        source?.disconnect();
        gain?.disconnect();
      } catch {
        /* nothing to release */
      }
      reportFailure();
      return;
    }
    const v: Voice = {
      name: 'drone',
      source,
      gain,
      fading: false,
      cleaned: false,
      fallbackTimer: null,
    };
    drone = v;
    track(v, null);
  }

  function reconcile(): void {
    const ctx = deps.getContext();
    if (ctx !== null) watch(ctx);
    if (!gate()) {
      if (voices.size > 0 || pending.size > 0) fadeAll();
      return;
    }
    if (ctx === null) return;
    if (droneWanted) {
      if (drone === null) startDrone(ctx);
    } else if (drone !== null) {
      fadeVoice(drone, ctx);
      drone = null;
    }
  }

  function play(name: OneShotName, options?: PlayOptions): PlayResult {
    try {
      const ctx = deps.getContext();
      if (ctx === null) return { started: false, reason: 'no-context' };
      watch(ctx);
      if (!gate()) return { started: false, reason: 'gate' };
      const seed = seedFor(name, options?.seed);
      const delayMs = options?.delayMs ?? 0;
      if (delayMs > 0) {
        const planned = generation;
        const record: Pending = { name, timer: 0 };
        record.timer = deps.setTimer(() => {
          pending.delete(record);
          try {
            const c = deps.getContext();
            if (c === null || planned !== generation || !gate()) return;
            startOneShot(c, name, seed);
          } catch {
            /* dropped */
          }
        }, delayMs);
        pending.add(record);
        return { started: true };
      }
      return startOneShot(ctx, name, seed);
    } catch {
      return { started: false, reason: 'generator-failed' };
    }
  }

  return {
    update(inputs) {
      try {
        soundOn = inputs.soundOn;
        quiet = inputs.quiet;
        reconcile();
      } catch {
        /* never throw */
      }
    },
    noteAwakenTap(outcome) {
      try {
        if (!outcome.ok) return;
        awakened = true;
        reconcile();
        play('awaken');
      } catch {
        /* never throw */
      }
    },
    setDroneWanted(wanted) {
      try {
        droneWanted = wanted;
        reconcile();
      } catch {
        /* never throw */
      }
    },
    play,
    stopOneShots() {
      try {
        clearPending();
        const ctx = deps.getContext();
        for (const v of [...voices]) {
          if (v.name === 'drone') continue;
          if (ctx === null) cleanup(v);
          else fadeVoice(v, ctx);
        }
      } catch {
        /* never throw */
      }
    },
    stopKind(name) {
      try {
        clearPending(name);
        const ctx = deps.getContext();
        for (const v of [...voices]) {
          if (v.name !== name) continue;
          if (ctx === null) cleanup(v);
          else fadeVoice(v, ctx);
        }
      } catch {
        /* never throw */
      }
    },
    dispose() {
      try {
        droneWanted = false;
        fadeAll();
        if (watchedContext !== null) {
          const listener = watched.get(watchedContext);
          if (listener !== undefined) watchedContext.removeEventListener('statechange', listener);
          watched.delete(watchedContext);
          watchedContext = null;
        }
      } catch {
        /* never throw */
      }
    },
  };
}

type FailureListener = (message: string) => void;
const failureListeners = new Set<FailureListener>();

/** Subscribe to the one-time failure notice of the app player. Returns an unsubscribe function. */
export function onHauntFailure(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

export const hauntPlayer: HauntPlayer = createHauntPlayer({
  getContext: currentContext,
  isRunning,
  now: () => performance.now(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (id) => window.clearTimeout(id),
  generate: generateSound,
  onFailure: (message) => {
    for (const l of [...failureListeners]) l(message);
  },
});
