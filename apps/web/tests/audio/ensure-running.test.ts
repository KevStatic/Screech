import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSessionForTests,
  ensureRunning,
  getOrCreateContext,
  isRunning,
} from '../../src/audio/session';

type FakeState = string;

interface Fake {
  readonly ctor: ReturnType<typeof vi.fn>;
  readonly resume: ReturnType<typeof vi.fn>;
  readonly stateReads: () => number;
  setState(s: FakeState): void;
}

function installFake(initial: FakeState, resumeImpl: () => Promise<void> = () => Promise.resolve()): Fake {
  let state = initial;
  let reads = 0;
  const resume = vi.fn(resumeImpl);
  const ctor = vi.fn(function (this: Record<string, unknown>) {
    Object.defineProperty(this, 'state', {
      get: () => {
        reads += 1;
        return state;
      },
    });
    this['resume'] = resume;
    this['sampleRate'] = 48000;
  });
  (globalThis as Record<string, unknown>)['AudioContext'] = ctor;
  return { ctor, resume, stateReads: () => reads, setState: (s) => (state = s) };
}

describe('ensureRunning / isRunning', () => {
  beforeEach(() => {
    __resetSessionForTests();
  });
  afterEach(() => {
    __resetSessionForTests();
    delete (globalThis as Record<string, unknown>)['AudioContext'];
  });

  describe('ensureRunning', () => {
    it('with no context creates nothing and calls nothing', async () => {
      const fake = installFake('suspended');
      await expect(ensureRunning()).resolves.toBeUndefined();
      expect(fake.ctor).not.toHaveBeenCalled();
      expect(fake.resume).not.toHaveBeenCalled();
    });

    it.each(['suspended', 'interrupted'])('calls resume() exactly once when %s', async (state) => {
      const fake = installFake(state);
      getOrCreateContext();
      await ensureRunning();
      expect(fake.resume).toHaveBeenCalledTimes(1);
      expect(fake.ctor).toHaveBeenCalledTimes(1);
    });

    it.each(['running', 'closed'])('calls nothing when %s', async (state) => {
      const fake = installFake(state);
      getOrCreateContext();
      await ensureRunning();
      expect(fake.resume).not.toHaveBeenCalled();
      expect(fake.ctor).toHaveBeenCalledTimes(1);
    });

    it('swallows a rejecting resume()', async () => {
      const fake = installFake('suspended', () => Promise.reject(new Error('blocked')));
      getOrCreateContext();
      await expect(ensureRunning()).resolves.toBeUndefined();
      expect(fake.resume).toHaveBeenCalledTimes(1);
    });

    it('does not read state after the await', async () => {
      let release: () => void = () => undefined;
      const fake = installFake(
        'suspended',
        () => new Promise<void>((r) => (release = r)),
      );
      getOrCreateContext();
      const before = fake.stateReads();
      const p = ensureRunning();
      const atCall = fake.stateReads();
      expect(atCall).toBeGreaterThan(before);
      fake.setState('running');
      release();
      await p;
      expect(fake.stateReads()).toBe(atCall);
    });
  });

  describe('isRunning', () => {
    it('is false with no context and creates nothing', () => {
      const fake = installFake('running');
      expect(isRunning()).toBe(false);
      expect(fake.ctor).not.toHaveBeenCalled();
    });

    it.each([
      ['running', true],
      ['suspended', false],
      ['interrupted', false],
      ['closed', false],
    ])('returns %s -> %s synchronously without resuming', (state, expected) => {
      const fake = installFake(state);
      getOrCreateContext();
      const result = isRunning();
      expect(typeof result).toBe('boolean');
      expect(result).toBe(expected);
      expect(fake.resume).not.toHaveBeenCalled();
      expect(fake.ctor).toHaveBeenCalledTimes(1);
    });
  });
});
