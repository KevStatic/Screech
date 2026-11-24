// Feature: ghost-hunt, task 10.2: App-level Ghost Hunt flow
// (Requirements 7.1, 7.13, 7.14, 10.5, 10.8, 14.1)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildClue, type ClueFieldsInput } from '@screech/core';
import App from '../../src/ui/App';
import { __resetSessionForTests } from '../../src/audio/session';
import { loadEngine, type EngineResult } from '../../src/audio/engine';
import { openMic } from '../../src/audio/mic';
import { startCapture, type CaptureHandlers } from '../../src/audio/capture';
import { playWaveform } from '../../src/audio/transmit';
import { encodeSetupLink } from '../../src/logic/hunt-link';
import { resetListenDedupe } from '../../src/ui/screens/Listen';
import { takeListenStart } from '../../src/ui/hooks/listen-handoff';
import { resetProgressStoreForTests } from '../../src/ui/hooks/progress-store';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import { LABEL_START_BEACON } from '../../src/ui/screens/Beacon';
import { LABEL_OPEN_NORMAL } from '../../src/ui/screens/BeaconError';

// Fake audio edges only: the real session, flow, hooks, store and screens run.
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

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  sampleRate = 44100;
  currentTime = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}

const HUNT = 'ABCDEF';
const TOTAL = 3;

let captured: CaptureHandlers[];

const backing = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string): string | null => backing.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    backing.set(key, value);
  },
  removeItem: (key: string): void => {
    backing.delete(key);
  },
};

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

async function tap(name: RegExp | string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

async function tapId(id: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(id));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function clueFields(index: number, name: string, clue: string): ClueFieldsInput {
  return { huntId: HUNT, index, total: TOTAL, name, clue };
}

function clueBytes(index: number, name: string, clue: string): Uint8Array {
  const built = buildClue(clueFields(index, name, clue));
  if (!built.ok) throw new Error('buildClue failed');
  return built.value;
}

/** Sets the address fragment from a real setup link. */
function setFragment(fields: ClueFieldsInput): void {
  const made = encodeSetupLink('https://screech.example/', fields);
  if (!made.ok) throw new Error('encodeSetupLink failed');
  window.history.replaceState(null, '', `/${made.link.slice(made.link.indexOf('#'))}`);
}

function hear(bytes: Uint8Array): Promise<void> {
  const handlers = captured[captured.length - 1];
  if (handlers === undefined) throw new Error('capture not started');
  return act(async () => {
    handlers.onPacketBytes(bytes);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  stubBrowser();
  FakeAudioContext.instances = [];
  __resetSessionForTests();
  resetListenDedupe();
  takeListenStart();
  backing.clear();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fakeStorage });
  resetProgressStoreForTests();
  window.history.replaceState(null, '', '/');
  setExorcise(false);
  captured = [];

  loadEngineMock.mockReset();
  loadEngineMock.mockResolvedValue(FAKE_ENGINE);
  const stream = { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
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
});

afterEach(() => {
  cleanup();
  takeListenStart();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetSessionForTests();
  window.history.replaceState(null, '', '/');
  backing.clear();
  resetProgressStoreForTests();
  setExorcise(false);
});

describe('App start route from the address fragment', () => {
  it('a valid setup fragment opens the Beacon with no mic request, no audio context and no sound', async () => {
    setFragment(clueFields(1, 'Mara', 'Look under the stairs'));
    render(<App />);

    expect(screenLabel('Beacon')).toBeTruthy();
    expect(screen.getByRole('button', { name: LABEL_START_BEACON })).toBeTruthy();
    expect(screen.queryByTestId('beacon-clue')).toBeNull();
    await advance(1000);
    expect(openMicMock).not.toHaveBeenCalled();
    expect(startCaptureMock).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(playWaveformMock).not.toHaveBeenCalled();
  });

  it('an invalid fragment shows the error, and the control opens the normal app', async () => {
    window.history.replaceState(null, '', '/#hunt=ABCDEF');
    render(<App />);

    expect(screen.getByTestId('beacon-error-message').textContent).toMatch(/missing/i);
    expect(screen.queryByTestId('beacon-start')).toBeNull();
    expect(openMicMock).not.toHaveBeenCalled();
    expect(playWaveformMock).not.toHaveBeenCalled();

    await tap(LABEL_OPEN_NORMAL);
    expect(screenLabel('Awaken')).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('a clean URL opens Awaken', () => {
    render(<App />);
    expect(screenLabel('Awaken')).toBeTruthy();
    expect(screen.queryByTestId('beacon-start')).toBeNull();
    expect(openMicMock).not.toHaveBeenCalled();
  });
});

describe('App full Ghost Hunt pass', () => {
  it('setup, new clue, reveal, back, already found note on Listen, last clue shows Hunt complete', async () => {
    render(<App />);

    // Setup opens from Awaken without any mic request, and Back returns to Awaken.
    await tapId('hunt-entry');
    expect(screenLabel('Ghost Hunt')).toBeTruthy();
    expect(screen.getByTestId('hunt-id')).toBeTruthy();
    expect(openMicMock).not.toHaveBeenCalled();
    await tapId('hunt-back');
    expect(screenLabel('Awaken')).toBeTruthy();

    // Player path: Awaken, Listen, start listening.
    await tap(/^awaken$/i);
    await tap('LISTEN');
    await advance(0);
    await tap(/start listening/i);
    await advance(0);
    expect(screenLabel('Listen')).toBeTruthy();

    // A new clue goes to the Hunt reveal screen.
    await hear(clueBytes(1, 'Mara', 'Look under the stairs'));
    expect(screenLabel('Ghost Hunt')).toBeTruthy();
    expect(screen.getByTestId('hunt-reveal-position').textContent).toBe('Spirit 1 of 3');
    expect(screen.getByTestId('hunt-reveal-full-text').textContent).toBe('Look under the stairs');
    await tapId('hunt-reveal-skip');
    expect(screen.getByTestId('hunt-follow-line')).toBeTruthy();

    // Back resumes Listen without a second Start tap.
    await tapId('hunt-reveal-back-listen');
    await advance(0);
    expect(screenLabel('Listen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start listening/i })).toBeNull();
    expect(captured.length).toBeGreaterThanOrEqual(2);

    // The same Spirit again: a note, no navigation.
    await advance(6000);
    await hear(clueBytes(1, 'Mara', 'Look under the stairs'));
    expect(screenLabel('Listen')).toBeTruthy();
    expect(screen.getByTestId('already-note').textContent).toContain(
      'Already found \u00b7 Spirit 1 of 3 \u00b7 Mara',
    );

    // Spirit 2 is new, then the last Spirit completes the Hunt.
    await hear(clueBytes(2, 'Orrin', 'Check the old clock'));
    expect(screen.getByTestId('hunt-reveal-position').textContent).toBe('Spirit 2 of 3');
    await tapId('hunt-reveal-skip');
    await tapId('hunt-reveal-back-listen');
    await advance(0);
    expect(screenLabel('Listen')).toBeTruthy();

    await hear(clueBytes(3, 'Wren', 'Try the garden gate'));
    expect(screen.getByTestId('hunt-reveal-position').textContent).toBe('Spirit 3 of 3');
    await tapId('hunt-reveal-skip');
    await advance(0);
    expect(screenLabel('Hunt complete')).toBeTruthy();
    expect(screen.getByTestId('hunt-complete-count').textContent).toContain('Spirits found: 3 of 3');
    expect(playWaveformMock).not.toHaveBeenCalled();
  });
});
