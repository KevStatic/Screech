// Feature: haunting-sounds, Property 16: The player never plays while the gate is closed and always ends silent
// **Validates: Requirements 3.6, 5.1, 5.2, 5.3, 5.4, 7.8, 9.9**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHauntPlayer } from '../../src/audio/haunt-player';
import { generateSound, scrapeSeed, type OneShotName, type SoundName } from '../../src/logic/haunt-synth';

const SAMPLE_RATE = 44100;
const SILENCE_DEADLINE_MS = 200;

// ---- inline fakes ---------------------------------------------------------

interface ParamEvent {
  readonly kind: 'set' | 'ramp';
  readonly v: number;
  readonly t: number;
}

class FakeParam {
  private initial = 1;
  private events: ParamEvent[] = [];
  readonly written: number[] = [];
  constructor(private readonly nowSec: () => number) {}
  get value(): number {
    return this.valueAt(this.nowSec());
  }
  set value(v: number) {
    this.written.push(v);
    this.initial = v;
    this.events = [];
  }
  setValueAtTime(v: number, t: number): void {
    this.written.push(v);
    this.events.push({ kind: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.written.push(v);
    this.events.push({ kind: 'ramp', v, t });
  }
  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e.t < t);
  }
  valueAt(t: number): number {
    let cur = this.initial;
    let prevT = -Infinity;
    for (const e of this.events) {
      if (e.t <= t) {
        cur = e.v;
        prevT = e.t;
        continue;
      }
      if (e.kind === 'ramp' && prevT > -Infinity) {
        return cur + ((e.v - cur) * (t - prevT)) / (e.t - prevT);
      }
      break;
    }
    return cur;
  }
}

class FakeGain {
  disconnected = false;
  readonly gain: FakeParam;
  constructor(nowSec: () => number) {
    this.gain = new FakeParam(nowSec);
  }
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeSource {
  buffer: { duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAtSec: number | null = null;
  stopAtSec: number | null = null;
  disconnected = false;
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  addEventListener(): void {}
  start(): void {
    this.startedAtSec = 0;
    this.onStart(this);
  }
  stop(t: number): void {
    this.stopAtSec = this.stopAtSec === null ? t : Math.min(this.stopAtSec, t);
  }
  constructor(private readonly onStart: (s: FakeSource) => void) {}
}

// ---- model ----------------------------------------------------------------

type Action =
  | { readonly kind: 'update'; readonly quiet: boolean; readonly soundOn: boolean }
  | { readonly kind: 'running'; readonly running: boolean }
  | { readonly kind: 'tap'; readonly ok: boolean }
  | { readonly kind: 'play'; readonly name: OneShotName; readonly delayMs: number | undefined; readonly seedIdx: number }
  | { readonly kind: 'drone'; readonly wanted: boolean }
  | { readonly kind: 'advance'; readonly ms: number };

const ONE_SHOTS: readonly OneShotName[] = [
  'awaken',
  'card-flip',
  'candle-crackle',
  'planchette-scrape',
  'whisper',
  'broken-crackle',
  'sealed-thud',
];

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('update' as const), quiet: fc.boolean(), soundOn: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('running' as const), running: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('tap' as const), ok: fc.boolean() }) },
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('play' as const),
      name: fc.constantFrom(...ONE_SHOTS),
      delayMs: fc.option(fc.integer({ min: 1, max: 500 }), { nil: undefined }),
      seedIdx: fc.integer({ min: 0, max: 4 }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('drone' as const), wanted: fc.boolean() }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 600 }) }) },
);

const sampleCache = new Map<string, Float32Array>();
function cachedSamples(name: SoundName, rate: number, seed: number): Float32Array {
  const key = `${name}|${rate}|${seed}`;
  let s = sampleCache.get(key);
  if (s === undefined) {
    s = generateSound(name, rate, seed);
    sampleCache.set(key, s);
  }
  return s;
}

function runScenario(actions: readonly Action[]): number {
  let nowMs = 0;
  const nowSec = (): number => nowMs / 1000;

  // Model of the gate inputs, kept by the harness.
  let awakened = false;
  let running = false;
  let soundOn = true;
  let quiet = false;
  const gateOpen = (): boolean => awakened && running && soundOn && !quiet;

  let closeEpoch = 0;
  let closedSinceMs: number | null = 0;
  let inTimer = false;
  const pendingRequests: { epoch: number; dueMs: number }[] = [];

  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const listeners = new Set<() => void>();

  // Fake timers.
  let nextTimerId = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  const setTimer = (fn: () => void, ms: number): number => {
    const id = nextTimerId++;
    timers.set(id, { due: nowMs + ms, fn });
    return id;
  };
  const clearTimer = (id: number): void => {
    timers.delete(id);
  };
  const advance = (ms: number): void => {
    const target = nowMs + ms;
    for (;;) {
      let best: [number, { due: number; fn: () => void }] | null = null;
      for (const entry of timers) {
        if (entry[1].due <= target && (best === null || entry[1].due < best[1].due)) best = entry;
      }
      if (best === null) break;
      timers.delete(best[0]);
      nowMs = Math.max(nowMs, best[1].due);
      inTimer = true;
      try {
        best[1].fn();
      } finally {
        inTimer = false;
      }
      observeGate();
    }
    nowMs = target;
  };

  function observeGate(): void {
    if (gateOpen()) {
      closedSinceMs = null;
    } else if (closedSinceMs === null) {
      closedSinceMs = nowMs;
      closeEpoch += 1;
    }
  }

  const onSourceStart = (s: FakeSource): void => {
    // No source may start while the gate is closed.
    expect(gateOpen(), 'source started while the gate was closed').toBe(true);
    s.startedAtSec = nowSec();
    if (inTimer) {
      // A delayed request may only play if no gate closing happened since it was made.
      const i = pendingRequests.findIndex((r) => r.epoch === closeEpoch && r.dueMs <= nowMs);
      expect(i, 'a delayed request played after the gate had closed').toBeGreaterThanOrEqual(0);
      pendingRequests.splice(i, 1);
    }
  };

  const isActive = (s: FakeSource, t: number): boolean => {
    if (s.startedAtSec === null) return false;
    if (s.stopAtSec !== null && s.stopAtSec <= t) return false;
    if (!s.loop && s.buffer !== null && s.startedAtSec + s.buffer.duration <= t) return false;
    return true;
  };

  const ctx = {
    sampleRate: SAMPLE_RATE,
    get currentTime(): number {
      return nowSec();
    },
    destination: {},
    createBuffer: (_channels: number, length: number, rate: number) => ({
      length,
      duration: length / rate,
      copyToChannel: () => undefined,
    }),
    createBufferSource: () => {
      const s = new FakeSource(onSourceStart);
      sources.push(s);
      return s;
    },
    createGain: () => {
      const g = new FakeGain(nowSec);
      gains.push(g);
      return g;
    },
    addEventListener: (_type: string, fn: () => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: string, fn: () => void) => {
      listeners.delete(fn);
    },
  } as unknown as AudioContext;

  const player = createHauntPlayer({
    getContext: () => ctx,
    isRunning: () => running,
    now: () => nowMs,
    setTimer,
    clearTimer,
    generate: cachedSamples,
    onFailure: () => undefined,
  });

  function check(): void {
    // Every gain value ever written is within 0..1.
    for (const g of gains) for (const v of g.gain.written) expect(v >= 0 && v <= 1).toBe(true);
    if (closedSinceMs !== null && nowMs - closedSinceMs >= SILENCE_DEADLINE_MS) {
      const t = nowSec();
      const live = sources.filter((s) => isActive(s, t));
      expect(live.length, 'sources still active after the gate closed').toBe(0);
      for (const g of gains) {
        if (g.disconnected) continue;
        expect(g.gain.valueAt(t), 'gain did not reach 0').toBeLessThanOrEqual(1e-9);
      }
    }
  }

  for (const a of actions) {
    switch (a.kind) {
      case 'update':
        quiet = a.quiet;
        soundOn = a.soundOn;
        player.update({ quiet: a.quiet, soundOn: a.soundOn });
        break;
      case 'running':
        running = a.running;
        for (const l of [...listeners]) l();
        break;
      case 'tap':
        if (a.ok) awakened = true;
        player.noteAwakenTap(a.ok ? { ok: true, ctx, sampleRate: SAMPLE_RATE } : { ok: false, reason: 'not-running' });
        break;
      case 'play': {
        const wasOpen = gateOpen();
        const res = player.play(a.name, { delayMs: a.delayMs, seed: scrapeSeed(a.seedIdx) });
        if (!wasOpen) expect(res.started).toBe(false);
        if (a.delayMs !== undefined && res.started) {
          pendingRequests.push({ epoch: closeEpoch, dueMs: nowMs + a.delayMs });
        }
        break;
      }
      case 'drone':
        player.setDroneWanted(a.wanted);
        break;
      case 'advance':
        advance(a.ms);
        break;
    }
    observeGate();
    check();
  }

  // Close the gate for good, wait past the fade, and expect silence.
  quiet = true;
  player.update({ quiet: true, soundOn });
  observeGate();
  advance(SILENCE_DEADLINE_MS + 50);
  check();
  const t = nowSec();
  expect(sources.filter((s) => isActive(s, t)).length).toBe(0);
  const startedBefore = sources.filter((s) => s.startedAtSec !== null).length;
  advance(2000);
  expect(sources.filter((s) => s.startedAtSec !== null).length).toBe(startedBefore);
  return startedBefore;
}

describe('haunt player gate', () => {
  it('Property 16: never plays while the gate is closed and always ends silent', () => {
    let totalStarts = 0;
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 40 }), fc.boolean(), (actions, openFirst) => {
        // Half of the runs begin with an open gate so playback is really exercised.
        const opening: Action[] = openFirst
          ? [{ kind: 'tap', ok: true }, { kind: 'running', running: true }]
          : [];
        totalStarts += runScenario([...opening, ...actions]);
      }),
      { numRuns: 150 },
    );
    // The scenarios must actually exercise playback, or the gate checks prove nothing.
    expect(totalStarts).toBeGreaterThan(50);
  });

  it('a delayed request made while open never plays after the gate closes and reopens', () => {
    runScenario([
      { kind: 'tap', ok: true },
      { kind: 'running', running: true },
      { kind: 'play', name: 'whisper', delayMs: 300, seedIdx: 0 },
      { kind: 'update', quiet: true, soundOn: true },
      { kind: 'update', quiet: false, soundOn: true },
      { kind: 'advance', ms: 500 },
    ]);
  });
});
