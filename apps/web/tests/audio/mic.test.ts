import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIC_BLOCKED_MESSAGE,
  MIC_DENIED_MESSAGE,
  MIC_UNAVAILABLE_MESSAGE,
  openMic,
  stopStream,
} from '../../src/audio/mic';

function namedError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openMic', () => {
  it('requests the exact constraints with every filter off', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const out = await openMic();
    expect(out).toEqual({ ok: true, stream });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
  });

  it('maps NotAllowedError to the denial message', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(namedError('NotAllowedError')) },
    });
    expect(await openMic()).toEqual({ ok: false, reason: 'denied', message: MIC_DENIED_MESSAGE });
  });

  it('maps SecurityError to the blocked message', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(namedError('SecurityError')) },
    });
    expect(await openMic()).toEqual({ ok: false, reason: 'blocked', message: MIC_BLOCKED_MESSAGE });
  });
  it('maps NotFoundError to the unavailable message', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(namedError('NotFoundError')) },
    });
    expect(await openMic()).toEqual({
      ok: false,
      reason: 'unavailable',
      message: MIC_UNAVAILABLE_MESSAGE,
    });
  });

  it('does not throw when mediaDevices is missing', async () => {
    vi.stubGlobal('navigator', {});
    expect(await openMic()).toEqual({
      ok: false,
      reason: 'unavailable',
      message: MIC_UNAVAILABLE_MESSAGE,
    });
  });

  it('treats a non-Error rejection as unavailable', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue('boom') },
    });
    const out = await openMic();
    expect(out.ok).toBe(false);
  });
});

describe('stopStream', () => {
  it('stops every track', () => {
    const a = { stop: vi.fn() };
    const b = { stop: vi.fn() };
    stopStream({ getTracks: () => [a, b] } as unknown as MediaStream);
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
  });
});
