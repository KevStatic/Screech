// Unit tests for createHauntPlayer with a fake context, clock and timers.
// Requirements: 3.8, 4.4, 4.7, 5.2, 6.5, 6.8, 6.10, 10.1, 10.3, 10.4, 10.5
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHauntPlayer, HAUNT_FAILURE_MESSAGE } from '../../src/audio/haunt-player';
import { generateSound, type SoundName } from '../../src/logic/haunt-synth';

// ---- inline fakes ---------------------------------------------------------

interface ParamCall {
  readonly kind: 'set' | 'ramp' | 'cancel';
  readonly v: number;
  readonly t: number;
}

class FakeParam {
  value = 1;
  readonly calls: ParamCall[] = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push({ kind: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push({ kind: 'ramp', v, t });
  }
  cancelScheduledValues(t: number): void {
    this.calls.push({ kind: 'cancel', v: 0, t });
  }
}

class FakeGain {
  disconnected = false;
  readonly gain = new FakeParam();
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeSource {
  buffer: { length: number; duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stopAt: number | null = null;
  disconnected = false;
  private readonly listeners = new Map<string, Array<() => void>>();
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  start(): void {
    this.started = true;
  }
  stop(t: number): void {
    this.stopAt = t;
  }
  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

interface Harness {
  readonly player: ReturnType<typeof createHauntPlayer>;
  readonly ctx: AudioContext;
  readonly sources: FakeSource[];
  readonly gains: FakeGain[];
  readonly generated: Array<{ name: SoundName; rate: number; seed: number }>;
  readonly failures: string[];
  readonly buffersCreated: number[];
  advance(ms: number): void;
  setTime(ms: number): void;
  timerCount(): number;
}

const sampleMemo = new Map<string, Float32Array>();
function realSamples(name: SoundName, rate: number, seed: number): Float32Array {
  const key = `${name}|${rate}|${seed}`;
  let s = sampleMemo.get(key);
  if (s === undefined) {
    s = generateSound(name, rate, seed);
    sampleMemo.set(key, s);
  }
  return s;
}

interface HarnessOptions {
  readonly sampleRate?: number;
  readonly generate?: (name: SoundName, rate: number, seed: number) => Float32Array;
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const sampleRate = options.sampleRate ?? 48000;
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const generated: Array<{ name: SoundName; rate: number; seed: number }> = [];
  const failures: string[] = [];
  const buffersCreated: number[] = [];

  const ctx = {
    sampleRate,
    get currentTime(): number {
      return nowMs / 1000;
    },
    destination: {},
    createBuffer: (_c: number, length: number, rate: number) => {
      buffersCreated.push(rate);
      return { length, duration: length / rate, copyToChannel: () => undefined };
    },
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    createGain: () => {
      const g = new FakeGain();
      gains.push(g);
      return g;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as AudioContext;

  const gen = options.generate ?? realSamples;
  const player = createHauntPlayer({
    getContext: () => ctx,
    isRunning: () => true,
    now: () => nowMs,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { due: nowMs + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    generate: (name, rate, seed) => {
      generated.push({ name, rate, seed });
      return gen(name, rate, seed);
    },
    onFailure: (m) => failures.push(m),
  });

  function advance(ms: number): void {
    const target = nowMs + ms;
    for (;;) {
      let best: [number, { due: number; fn: () => void }] | null = null;
      for (const e of timers) if (e[1].due <= target && (best === null || e[1].due < best[1].due)) best = e;
      if (best === null) break;
      timers.delete(best[0]);
      nowMs = Math.max(nowMs, best[1].due);
      best[1].fn();
    }
    nowMs = target;
  }

  return {
    player,
    ctx,
    sources,
    gains,
    generated,
    failures,
    buffersCreated,
    advance,
    setTime: (ms) => {
      nowMs = ms;
    },
    timerCount: () => timers.size,
  };
}

function open(h: Harness): void {
  h.player.update({ quiet: false, soundOn: true });
  // The awaken tap opens the gate and plays the awaken sound.
  h.player.noteAwakenTap({ ok: true, ctx: h.ctx, sampleRate: h.ctx.sampleRate });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- tests ----------------------------------------------------------------

describe('createHauntPlayer', () => {
  it('uses the cached buffer on a second play of the same sound (Req 6.5)', () => {
    const h = makeHarness();
    open(h);
    const awakenGenerations = h.generated.filter((g) => g.name === 'awaken').length;
    expect(awakenGenerations).toBe(1);
    h.setTime(1000);
    expect(h.player.play('awaken')).toEqual({ started: true });
    expect(h.generated.filter((g) => g.name === 'awaken')).toHaveLength(1);
    expect(h.buffersCreated).toHaveLength(1);
    expect(h.sources).toHaveLength(2);
    expect(h.sources[1]?.buffer).toBe(h.sources[0]?.buffer);
  });

  it('never creates a second AudioContext (Req 4.4)', () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    vi.stubGlobal('webkitAudioContext', ctor);
    const h = makeHarness();
    open(h);
    h.player.setDroneWanted(true);
    h.setTime(1000);
    h.player.play('card-flip');
    h.player.play('whisper', { delayMs: 50 });
    h.advance(100);
    h.player.dispose();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('refuses to play and creates nothing without a context', () => {
    const player = createHauntPlayer({
      getContext: () => null,
      isRunning: () => false,
      now: () => 0,
      setTimer: () => 1,
      clearTimer: () => undefined,
      generate: realSamples,
      onFailure: () => undefined,
    });
    expect(player.play('awaken')).toEqual({ started: false, reason: 'no-context' });
  });

  it('loops the drone with loopStart 0 and loopEnd one sample short of the buffer (Req 3.8, 6.8)', () => {
    const h = makeHarness();
    open(h);
    h.player.setDroneWanted(true);
    const drone = h.sources.find((s) => s.loop);
    expect(drone).toBeDefined();
    expect(drone?.started).toBe(true);
    expect(drone?.loopStart).toBe(0);
    const len = drone?.buffer?.length ?? 0;
    expect(drone?.loopEnd).toBeCloseTo((len - 1) / 48000, 12);
    expect(drone?.loopEnd).toBeLessThan(len / 48000);
    // One-shots never loop.
    expect(h.sources.filter((s) => !s.loop).length).toBeGreaterThan(0);
  });

  it('ramps the drone gain from 0 to full over at least 0.5 s (Req 3.8)', () => {
    const h = makeHarness();
    open(h);
    h.setTime(2000);
    h.player.setDroneWanted(true);
    const gain = h.gains[h.gains.length - 1];
    const calls = gain?.gain.calls ?? [];
    const set = calls.find((c) => c.kind === 'set');
    const ramp = calls.find((c) => c.kind === 'ramp');
    expect(set).toMatchObject({ v: 0, t: 2 });
    expect(ramp?.v).toBe(1);
    expect((ramp?.t ?? 0) - 2).toBeGreaterThanOrEqual(0.5);
  });

  it('fades a one-shot over 120 ms and stops it at 130 ms (Req 6.10)', () => {
    const h = makeHarness();
    open(h);
    h.setTime(1000);
    h.player.play('whisper');
    const src = h.sources[h.sources.length - 1] as FakeSource;
    const gain = h.gains[h.gains.length - 1] as FakeGain;
    h.player.stopOneShots();
    const ramp = gain.gain.calls.find((c) => c.kind === 'ramp');
    expect(ramp?.v).toBe(0);
    expect(ramp?.t).toBeCloseTo(1.12, 9);
    expect(src.stopAt).toBeCloseTo(1.13, 9);
  });

  it('fades the drone on update when the gate closes and disconnects by the fallback timer (Req 5.2)', () => {
    const h = makeHarness();
    open(h);
    h.player.setDroneWanted(true);
    const src = h.sources.find((s) => s.loop) as FakeSource;
    const gain = h.gains[h.gains.length - 1] as FakeGain;
    h.setTime(500);
    h.player.update({ quiet: true, soundOn: true });
    expect(src.stopAt).toBeCloseTo(0.63, 9);
    expect(gain.gain.calls.some((c) => c.kind === 'ramp' && c.v === 0)).toBe(true);
    expect(src.disconnected).toBe(false);
    h.advance(300);
    expect(src.disconnected).toBe(true);
    expect(gain.disconnected).toBe(true);
  });

  it('shows the failure notice once however often generation fails (Req 6.10)', () => {
    const h = makeHarness({
      generate: () => {
        throw new Error('boom');
      },
    });
    open(h);
    h.setTime(1000);
    expect(h.player.play('card-flip')).toEqual({ started: false, reason: 'generator-failed' });
    h.setTime(2000);
    expect(h.player.play('whisper')).toEqual({ started: false, reason: 'generator-failed' });
    h.setTime(3000);
    h.player.play('sealed-thud');
    expect(h.failures).toEqual([HAUNT_FAILURE_MESSAGE]);
    expect(h.sources).toHaveLength(0);
  });

  it('refuses a sound that fails checkSound and never plays it (Req 4.7)', () => {
    const h = makeHarness({ generate: (_n, rate) => new Float32Array(rate / 2) });
    open(h);
    h.setTime(1000);
    expect(h.player.play('card-flip')).toEqual({ started: false, reason: 'invalid-sound' });
    expect(h.sources).toHaveLength(0);
    expect(h.buffersCreated).toHaveLength(0);
  });

  it('refuses a sound with NaN samples', () => {
    const h = makeHarness({
      generate: (_n, rate) => new Float32Array(rate / 2).fill(Number.NaN),
    });
    open(h);
    h.setTime(1000);
    expect(h.player.play('whisper')).toEqual({ started: false, reason: 'invalid-sound' });
  });

  it('reads the sample rate from the context, never a constant (Req 6.5)', () => {
    for (const rate of [44100, 48000]) {
      const h = makeHarness({ sampleRate: rate });
      open(h);
      expect(h.generated.length).toBeGreaterThan(0);
      for (const g of h.generated) expect(g.rate).toBe(rate);
      expect(h.buffersCreated.every((r) => r === rate)).toBe(true);
    }
  });

  it('disconnects the source and gain after ended and clears the fallback timer (Req 6.8)', () => {
    const h = makeHarness();
    open(h);
    const src = h.sources[0] as FakeSource;
    const gain = h.gains[0] as FakeGain;
    expect(src.disconnected).toBe(false);
    expect(h.timerCount()).toBe(1);
    src.fire('ended');
    expect(src.disconnected).toBe(true);
    expect(gain.disconnected).toBe(true);
    expect(h.timerCount()).toBe(0);
  });

  it('disconnects by the fallback timer when ended never fires', () => {
    const h = makeHarness();
    open(h);
    const src = h.sources[0] as FakeSource;
    h.advance(5000);
    expect(src.disconnected).toBe(true);
  });
});

describe('Exorcise and reduced motion (Req 10.1, 10.3, 10.4, 10.5)', () => {
  it('update takes only quiet and soundOn, and sound plays regardless of any motion setting', () => {
    const h = makeHarness();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined }));
    h.player.update({ quiet: false, soundOn: true });
    h.player.noteAwakenTap({ ok: true, ctx: h.ctx, sampleRate: h.ctx.sampleRate });
    expect(h.sources).toHaveLength(1);
    expect(h.sources[0]?.started).toBe(true);
  });

  it('the player source and its dependencies mention neither Exorcise nor reduced motion', () => {
    const src = readFileSync(new URL('../../src/audio/haunt-player.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/exorcis/i);
    expect(src).not.toMatch(/reduced|prefers-reduced|matchMedia|motion/i);
  });
});
