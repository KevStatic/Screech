import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ClueFields } from '@screech/core';
import {
  QUIET_MESSAGE,
  RUNNING_CHECK_MS,
  UNLOCK_FAILED_MESSAGE,
  UNLOCK_TIMEOUT_MS,
  useBeacon,
  type BeaconDeps,
} from '../../src/ui/hooks/useBeacon';
import type { PlaybackHandle, PlaybackResult } from '../../src/audio/transmit';
import type { WakeStatus } from '../../src/audio/wake-lock';

const FIELDS: ClueFields = {
  huntId: 'ABCDEF',
  index: 1,
  total: 3,
  name: 'Mara',
  clue: 'Look under the stairs',
};

interface FakeCtx {
  state: 'running' | 'suspended';
  sampleRate: number;
}

interface Harness {
  readonly deps: BeaconDeps;
  readonly log: string[];
  readonly ctx: FakeCtx;
  readonly rates: number[];
  readonly handles: Array<{ handle: PlaybackHandle; finish: (r: PlaybackResult) => void; stop: ReturnType<typeof vi.fn> }>;
  readonly wakeAcquire: ReturnType<typeof vi.fn>;
  readonly wakeRelease: ReturnType<typeof vi.fn>;
  unlockResult: () => Promise<{ ok: true; ctx: AudioContext; sampleRate: number }>;
}

function makeHarness(): Harness {
  const log: string[] = [];
  const rates: number[] = [];
  const ctx: FakeCtx = { state: 'running', sampleRate: 44100 };
  const handles: Harness['handles'] = [];
  const wakeAcquire = vi.fn((): Promise<WakeStatus> => Promise.resolve('held'));
  const wakeRelease = vi.fn((): Promise<void> => Promise.resolve());
  const h: Harness = {
    log,
    ctx,
    rates,
    handles,
    wakeAcquire,
    wakeRelease,
    unlockResult: () =>
      Promise.resolve({ ok: true as const, ctx: ctx as unknown as AudioContext, sampleRate: ctx.sampleRate }),
    deps: {
      unlockAudio: () => {
        log.push('unlock');
        return h.unlockResult();
      },
      ensureRunning: () => {
        log.push('ensure');
        return Promise.resolve();
      },
      currentContext: () => ctx as unknown as AudioContext,
      loadEngine: (rate: number) => {
        log.push('engine');
        rates.push(rate);
        return Promise.resolve({
          ok: true as const,
          engine: { encode: () => new Float32Array(8), decode: () => null },
        });
      },
      playWaveform: () => {
        log.push('play');
        let finish: (r: PlaybackResult) => void = () => undefined;
        const finished = new Promise<PlaybackResult>((resolve) => {
          finish = resolve;
        });
        const stop = vi.fn();
        const handle: PlaybackHandle = { durationSec: 1, elapsedSec: () => 0, stop, finished };
        handles.push({ handle, finish, stop });
        return handle;
      },
      wake: {
        acquire: wakeAcquire,
        release: wakeRelease,
        onChange: () => () => undefined,
      },
      now: () => Date.now(),
      random: () => 0, // interval is exactly 15000 ms
      transmitVolume: 10,
    } as unknown as BeaconDeps,
  };
  return h;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const count = (log: string[], what: string): number => log.filter((x) => x === what).length;

describe('useBeacon', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers();
    h = makeHarness();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function setup(fields: ClueFields = FIELDS) {
    return renderHook(() => useBeacon(fields, h.deps));
  }

  it('makes no sound and touches no audio before start', async () => {
    const { result } = setup();
    await advance(60_000);
    expect(h.log).toEqual([]);
    expect(result.current.phase).toBe('idle');
  });

  it('calls unlockAudio synchronously as the first thing in the start handler', () => {
    const { result } = setup();
    act(() => {
      result.current.start();
      expect(h.log).toEqual(['unlock']);
    });
  });

  it('shows a plain message when unlock takes longer than 3000 ms', async () => {
    h.unlockResult = () => new Promise(() => undefined);
    const { result } = setup();
    act(() => result.current.start());
    await advance(UNLOCK_TIMEOUT_MS - 1);
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe('starting');
    await advance(1);
    expect(result.current.error).toBe(UNLOCK_FAILED_MESSAGE);
    expect(result.current.phase).toBe('idle');
    expect(h.log).toEqual(['unlock']);
    expect(h.wakeAcquire).not.toHaveBeenCalled();
  });

  it('sends the first screech within 1000 ms of start and requests the wake lock', async () => {
    const { result } = setup();
    act(() => result.current.start());
    await advance(RUNNING_CHECK_MS);
    expect(count(h.log, 'play')).toBe(1);
    expect(result.current.phase).toBe('running');
    expect(result.current.screeching).toBe(true);
    expect(h.wakeAcquire).toHaveBeenCalledTimes(1);
    expect(result.current.wake).toBe('held');
  });

  it('never overlaps screeches, and sends the next one 15 s after the start of the last', async () => {
    const { result } = setup();
    act(() => result.current.start());
    await advance(100);
    expect(count(h.log, 'play')).toBe(1);
    // Playing lasts past the due time: no second screech.
    await advance(30_000);
    expect(count(h.log, 'play')).toBe(1);
    act(() => h.handles[0]!.finish('ended'));
    await advance(300);
    // Already overdue, so the next tick sends it (and it is the only one playing).
    expect(count(h.log, 'play')).toBe(2);
    expect(result.current.screeching).toBe(true);
    await advance(5_000);
    expect(count(h.log, 'play')).toBe(2);
  });

  it('wakes the audio context before each screech and reads the sample rate each time', async () => {
    const { result } = setup();
    act(() => result.current.start());
    await advance(100);
    act(() => h.handles[0]!.finish('ended'));
    h.ctx.sampleRate = 48000;
    await advance(15_000);
    expect(h.rates).toEqual([44100, 48000]);
    // Every play is preceded by an ensureRunning, with the engine loaded in between.
    const seq = h.log.filter((x) => x !== 'unlock');
    expect(seq).toEqual(['ensure', 'engine', 'play', 'ensure', 'engine', 'play']);
    expect(result.current.error).toBeNull();
  });

  it('goes quiet when the context is not running, and one wake tap resumes with one screech', async () => {
    h.ctx.state = 'suspended';
    const { result } = setup();
    act(() => result.current.start());
    await advance(RUNNING_CHECK_MS);
    expect(result.current.quiet).toBe(true);
    expect(result.current.error).toBe(QUIET_MESSAGE);
    expect(count(h.log, 'play')).toBe(0);
    // Quiet stays quiet: no retries from the loop.
    await advance(60_000);
    expect(count(h.log, 'play')).toBe(0);

    h.ctx.state = 'running';
    h.log.length = 0;
    act(() => {
      result.current.wakeTap();
      expect(h.log[0]).toBe('unlock');
    });
    await advance(100);
    expect(result.current.quiet).toBe(false);
    expect(result.current.error).toBeNull();
    expect(count(h.log, 'play')).toBe(1);
  });

  it('skips a screech when the clue cannot be built, shows why, and keeps the schedule', async () => {
    const bad: ClueFields = { ...FIELDS, name: 'x'.repeat(30) };
    const { result } = setup(bad);
    act(() => result.current.start());
    await advance(100);
    expect(count(h.log, 'play')).toBe(0);
    expect(result.current.error).not.toBeNull();
    expect(result.current.quiet).toBe(false);
    expect(result.current.screeching).toBe(false);
    const attempts = count(h.log, 'ensure');
    expect(attempts).toBe(1);
    // Next try is one interval after the skip, not sooner.
    await advance(14_000);
    expect(count(h.log, 'ensure')).toBe(attempts);
    await advance(1_500);
    expect(count(h.log, 'ensure')).toBe(attempts + 1);
  });

  it('stop cuts a playing screech, cancels all timers and releases the wake lock', async () => {
    const { result } = setup();
    act(() => result.current.start());
    await advance(100);
    expect(result.current.screeching).toBe(true);
    act(() => result.current.stop());
    await advance(0);
    expect(h.handles[0]!.stop).toHaveBeenCalledTimes(1);
    expect(h.wakeRelease).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
    expect(result.current.screeching).toBe(false);
    expect(result.current.wake).toBe('idle');
    const before = h.log.length;
    await advance(120_000);
    expect(h.log.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops everything and releases the wake lock when the screen unmounts', async () => {
    const { result, unmount } = setup();
    act(() => result.current.start());
    await advance(100);
    unmount();
    expect(h.handles[0]!.stop).toHaveBeenCalledTimes(1);
    expect(h.wakeRelease).toHaveBeenCalled();
    const before = h.log.length;
    await advance(60_000);
    expect(h.log.length).toBe(before);
  });
});
