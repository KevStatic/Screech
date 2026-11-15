import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { encode } from '@screech/core';
import App from '../../src/ui/App';
import { __resetSessionForTests } from '../../src/audio/session';
import { loadEngine, type EngineResult } from '../../src/audio/engine';
import { openMic } from '../../src/audio/mic';
import { startCapture, type CaptureHandlers } from '../../src/audio/capture';
import { playWaveform, type PlaybackHandle, type PlaybackResult } from '../../src/audio/transmit';
import { HOLD_DURATION_MS } from '../../src/logic/hold-machine';
import { resetListenDedupe } from '../../src/ui/screens/Listen';
import { NOTICE_SEND_BLOCKED } from '../../src/logic/flow';
import { WAKE_LABEL } from '../../src/ui/screens/Speak';
import { setExorcise } from '../../src/ui/hooks/useMotion';

// Fake audio edges only: the real session, flow, hooks and screens run.
vi.mock('../../src/audio/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/engine')>();
  return { ...actual, loadEngine: vi.fn() };
});
vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn(), stopStream: vi.fn() };
});
vi.mock('../../src/audio/capture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/capture')>();
  return { ...actual, startCapture: vi.fn() };
});
vi.mock('../../src/audio/transmit', () => ({ playWaveform: vi.fn() }));

const loadEngineMock = vi.mocked(loadEngine);
const openMicMock = vi.mocked(openMic);
const startCaptureMock = vi.mocked(startCapture);
const playWaveformMock = vi.mocked(playWaveform);

const FAKE_ENGINE: EngineResult = {
  ok: true,
  engine: { encode: () => new Float32Array(480), decode: () => null },
};

/** AudioContext stand-in. `onResume` decides what each resume() does. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static onResume: (ctx: FakeAudioContext) => Promise<void> = (ctx) => {
    ctx.state = 'running';
    return Promise.resolve();
  };
  state: AudioContextState = 'suspended';
  sampleRate = 44100;
  currentTime = 0;
  resumeCalls = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    return FakeAudioContext.onResume(this);
  }
}
const ctx = (): FakeAudioContext => {
  const c = FakeAudioContext.instances[0];
  if (c === undefined) throw new Error('no audio context yet');
  return c;
};

let finish: (result: PlaybackResult) => void;
let captured: CaptureHandlers[];

function stubBrowser(): void {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}

const screenLabel = (name: string): HTMLElement => screen.getByText(`Screen: ${name}`);
const listenButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'LISTEN' });
const keyButton = (): HTMLElement => screen.getByRole('button', { name: /screech/i });

async function tap(name: RegExp | string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function awaken(): Promise<void> {
  render(<App />);
  expect(screenLabel('Awaken')).toBeTruthy();
  await tap(/^awaken$/i);
}

async function holdKey(): Promise<void> {
  const key = keyButton();
  fireEvent.keyDown(key, { key: ' ' });
  await advance(HOLD_DURATION_MS + 200);
  // The key may be gone by now (the screen moved to Screeching).
  fireEvent.keyUp(key, { key: ' ' });
  await advance(0);
}

function write(text: string): void {
  fireEvent.change(screen.getByLabelText('Your whisper'), { target: { value: text } });
}

function packet(text: string): Uint8Array {
  const encoded = encode({ type: 'text', text });
  if (!encoded.ok) throw new Error('fixture failed to encode');
  return encoded.value;
}

async function startListening(): Promise<CaptureHandlers> {
  await tap(/start listening/i);
  await advance(0);
  const handlers = captured[captured.length - 1];
  if (handlers === undefined) throw new Error('capture not started');
  return handlers;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  stubBrowser();
  FakeAudioContext.instances = [];
  FakeAudioContext.onResume = (c) => {
    c.state = 'running';
    return Promise.resolve();
  };
  __resetSessionForTests();
  resetListenDedupe();
  setExorcise(false);
  captured = [];

  loadEngineMock.mockReset();
  loadEngineMock.mockResolvedValue(FAKE_ENGINE);

  const stream = {
    getTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  openMicMock.mockReset();
  openMicMock.mockResolvedValue({ ok: true, stream });

  const analyser = {
    frequencyBinCount: 512,
    fftSize: 1024,
    getByteFrequencyData: (data: Uint8Array): void => data.fill(0),
  } as unknown as AnalyserNode;
  startCaptureMock.mockReset();
  startCaptureMock.mockImplementation((_c, _s, _d, handlers) => {
    captured.push(handlers);
    return Promise.resolve({
      ok: true as const,
      handle: { analyser, lastBlockAt: () => performance.now(), stop: () => undefined },
    });
  });

  playWaveformMock.mockReset();
  playWaveformMock.mockImplementation(() => {
    const handle: PlaybackHandle = {
      durationSec: 2,
      elapsedSec: () => 0,
      stop: () => undefined,
      finished: new Promise<PlaybackResult>((resolve) => {
        finish = resolve;
      }),
    };
    return handle;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetSessionForTests();
  setExorcise(false);
});

describe('full flow (App with fake audio and engine)', () => {
  it('Awaken to Speak after the tap unlocks audio and the mic is granted (15.2)', async () => {
    await awaken();
    expect(screenLabel('Speak')).toBeTruthy();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx().state).toBe('running');
    expect(openMicMock).toHaveBeenCalledTimes(1);
  });

  it('hold on a running context transmits and shows Screeching, then returns to Speak (8.13)', async () => {
    await awaken();
    write('hello from the other side');
    await holdKey();

    expect(playWaveformMock).toHaveBeenCalledTimes(1);
    expect(playWaveformMock.mock.calls[0]?.[0]).toBe(ctx());
    expect(screenLabel('Screeching')).toBeTruthy();
    expect(screen.queryByText(WAKE_LABEL)).toBeNull();

    await act(async () => {
      finish('ended');
      await Promise.resolve();
    });
    expect(screen.getByTestId('screeching-done')).toBeTruthy();
    await tap(/back to speak/i);
    expect(screenLabel('Speak')).toBeTruthy();
    expect(listenButton().disabled).toBe(false);
  });

  it('hold on a suspended context shows the wake control and sends nothing, then the wake tap transmits once (8.13, 8.14, 16.9)', async () => {
    await awaken();
    write('still here');
    // The tab slept: the context is suspended and the keep-alive resume does not land.
    ctx().state = 'suspended';
    FakeAudioContext.onResume = () => new Promise<void>(() => undefined);
    const resumesBefore = ctx().resumeCalls;
    await holdKey();

    // 16.9: the keydown ran ensureRunning; the hold timer did not resume or create anything.
    expect(ctx().resumeCalls).toBe(resumesBefore + 1);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(playWaveformMock).not.toHaveBeenCalled();
    expect(screenLabel('Speak')).toBeTruthy();
    expect(screen.getByText(WAKE_LABEL)).toBeTruthy();
    expect((screen.getByLabelText('Your whisper') as HTMLTextAreaElement).value).toBe('still here');

    FakeAudioContext.onResume = (c) => {
      c.state = 'running';
      return Promise.resolve();
    };
    await tap(WAKE_LABEL);
    await advance(0);

    expect(playWaveformMock).toHaveBeenCalledTimes(1);
    expect(screenLabel('Screeching')).toBeTruthy();
  });

  it('a failed wake tap keeps the wake control and sends nothing (8.15)', async () => {
    await awaken();
    write('retry me');
    ctx().state = 'suspended';
    FakeAudioContext.onResume = () => new Promise<void>(() => undefined);
    await holdKey();

    FakeAudioContext.onResume = () => Promise.reject(new Error('blocked'));
    await tap(WAKE_LABEL);
    await advance(0);

    expect(screen.getByText('Audio could not start. Tap to try again.')).toBeTruthy();
    expect(screen.getByText(WAKE_LABEL)).toBeTruthy();
    expect(playWaveformMock).not.toHaveBeenCalled();
    expect(screenLabel('Speak')).toBeTruthy();
  });

  it('listening is blocked while transmitting: no Listen control, no second mic request (15.5, 15.6)', async () => {
    await awaken();
    write('on air');
    await holdKey();
    expect(screenLabel('Screeching')).toBeTruthy();

    expect(screen.queryByRole('button', { name: 'LISTEN' })).toBeNull();
    expect(screen.queryByRole('button', { name: /start listening/i })).toBeNull();
    // Only the Awaken request. The mic stays closed during playback.
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(startCaptureMock).not.toHaveBeenCalled();
  });

  it('sending is blocked while listening and the screen says so (15.7)', async () => {
    await awaken();
    await tap('LISTEN');
    await advance(0);
    expect(screenLabel('Listen')).toBeTruthy();
    expect(screen.getByTestId('listen-send-notice').textContent).toBe(NOTICE_SEND_BLOCKED);
    expect(screen.queryByRole('button', { name: /screech/i })).toBeNull();
  });

  it('Listen to Reveal on a decoded packet (12.12)', async () => {
    await awaken();
    await tap('LISTEN');
    await advance(0);
    const handlers = await startListening();
    expect(screen.getByTestId('listen-label')).toBeTruthy();

    await act(async () => {
      handlers.onPacketBytes(packet('boo'));
    });
    expect(screenLabel('Reveal')).toBeTruthy();
    expect(screen.getByTestId('reveal-full-text').textContent).toBe('boo');
  });

  it('ignores the same packet within 5 seconds and shows it again after (12.12)', async () => {
    await awaken();
    await tap('LISTEN');
    await advance(0);
    const first = await startListening();
    await act(async () => {
      first.onPacketBytes(packet('boo'));
    });
    expect(screenLabel('Reveal')).toBeTruthy();

    await tap(/back to listen/i);
    expect(screenLabel('Listen')).toBeTruthy();
    const second = await startListening();

    await advance(2000);
    await act(async () => {
      second.onPacketBytes(packet('boo'));
    });
    // Duplicate: the current screen does not change.
    expect(screenLabel('Listen')).toBeTruthy();
    expect(screen.queryByText('Screen: Reveal')).toBeNull();

    await advance(3500);
    await act(async () => {
      second.onPacketBytes(packet('boo'));
    });
    expect(screenLabel('Reveal')).toBeTruthy();
  });

  describe('range lab', () => {
    const encodeSpy = vi.fn((_p: Uint8Array, _o?: unknown) => new Float32Array(480));
    beforeEach(() => {
      encodeSpy.mockClear();
      loadEngineMock.mockResolvedValue({ ok: true, engine: { encode: encodeSpy, decode: () => null } });
    });
    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });
    it('is hidden without ?lab=1 and the default transmission passes no options', async () => {
      await awaken();
      expect(screen.queryByTestId('range-lab')).toBeNull();
      write('plain send');
      await holdKey();
      expect(encodeSpy).toHaveBeenCalledTimes(1);
      expect(encodeSpy.mock.calls[0]).toHaveLength(1);
    });
    it('with ?lab=1 shows the selectors, defaulting to 50 and fast', async () => {
      window.history.replaceState(null, '', '/?lab=1');
      await awaken();
      expect(screen.getByTestId('range-lab')).toBeTruthy();
      expect((screen.getByLabelText('Transmit volume') as HTMLSelectElement).value).toBe('50');
      expect((screen.getByLabelText('Protocol') as HTMLSelectElement).value).toBe('fast');
      write('lab default');
      await holdKey();
      expect(encodeSpy.mock.calls[0]?.[1]).toEqual({ volume: 50, protocol: 'fast' });
    });
    it('with ?lab=1 transmits with the chosen volume and protocol', async () => {
      window.history.replaceState(null, '', '/?lab=1');
      await awaken();
      fireEvent.change(screen.getByLabelText('Transmit volume'), { target: { value: '75' } });
      fireEvent.change(screen.getByLabelText('Protocol'), { target: { value: 'normal' } });
      write('lab custom');
      await holdKey();
      expect(encodeSpy.mock.calls[0]?.[1]).toEqual({ volume: 75, protocol: 'normal' });
    });
  });
});
