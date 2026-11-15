import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSessionForTests,
  currentContext,
  unlockAudio,
} from '../../src/audio/session';

type State = 'running' | 'suspended' | 'interrupted' | 'closed';

const log: string[] = [];
const getUserMedia = vi.fn();

interface FakeOptions {
  initial: State;
  onResume: 'running' | 'stay' | 'reject';
}
let options: FakeOptions;
let instances: FakeContext[];

class FakeContext {
  state: State;
  sampleRate = 44100;
  constructor() {
    log.push('create');
    this.state = options.initial;
    instances.push(this);
  }
  resume(): Promise<void> {
    log.push('resume');
    if (options.onResume === 'reject') return Promise.reject(new Error('blocked'));
    if (options.onResume === 'running') this.state = 'running';
    return Promise.resolve();
  }
}

beforeEach(() => {
  log.length = 0;
  instances = [];
  options = { initial: 'suspended', onResume: 'running' };
  getUserMedia.mockReset();
  __resetSessionForTests();
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetSessionForTests();
});

describe('unlockAudio', () => {
  it('skips resume when the context is already running', async () => {
    options.initial = 'running';
    const out = await unlockAudio();
    expect(out).toEqual({ ok: true, ctx: instances[0], sampleRate: 44100 });
    expect(log).toEqual(['create']);
  });

  it('resumes a suspended context and reports the context sample rate', async () => {
    const out = await unlockAudio();
    expect(out.ok).toBe(true);
    expect(log).toEqual(['create', 'resume']);
    expect(currentContext()).toBe(instances[0]);
  });

  it('issues create and resume synchronously, before any await boundary', () => {
    const pending = unlockAudio();
    expect(log).toEqual(['create', 'resume']);
    return pending;
  });

  it('reports resume-rejected when resume() rejects', async () => {
    options.onResume = 'reject';
    expect(await unlockAudio()).toEqual({ ok: false, reason: 'resume-rejected' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reports not-running when resume resolves but the context stays suspended', async () => {
    options.onResume = 'stay';
    expect(await unlockAudio()).toEqual({ ok: false, reason: 'not-running' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('treats the interrupted state as needing a resume', async () => {
    options.initial = 'interrupted';
    const out = await unlockAudio();
    expect(out.ok).toBe(true);
    expect(log).toEqual(['create', 'resume']);
  });

  it('replaces a closed context inside unlockAudio()', async () => {
    options.initial = 'running';
    const first = await unlockAudio();
    expect(first.ok).toBe(true);
    instances[0]!.state = 'closed';
    log.length = 0;
    const pending = unlockAudio();
    expect(log).toEqual(['create']);
    const second = await pending;
    expect(instances).toHaveLength(2);
    expect(second.ok && second.ctx).toBe(instances[1]);
    expect(currentContext()).toBe(instances[1]);
  });

  it('reuses a live context on later calls', async () => {
    await unlockAudio();
    await unlockAudio();
    expect(instances).toHaveLength(1);
  });

  it('falls back to webkitAudioContext when AudioContext is missing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeContext);
    const out = await unlockAudio();
    expect(out.ok).toBe(true);
    expect(instances).toHaveLength(1);
  });

  it('reports context-unavailable when no constructor exists', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(await unlockAudio()).toEqual({ ok: false, reason: 'context-unavailable' });
  });

  it('never opens the microphone itself, on success or failure', async () => {
    await unlockAudio();
    options.onResume = 'stay';
    __resetSessionForTests();
    await unlockAudio();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('a caller gating openMic on the outcome skips getUserMedia when not running', async () => {
    const { openMic } = await import('../../src/audio/mic');
    options.onResume = 'stay';
    const out = await unlockAudio();
    if (out.ok) await openMic();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
