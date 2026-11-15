import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useEffect, type ReactElement } from 'react';
import Speak, {
  MSG_WAKE_FAILED,
  MSG_WAKE_SLEEPING,
  WAKE_LABEL,
  type TransmissionOutcome,
} from '../../src/ui/screens/Speak';
import { useFlow } from '../../src/ui/hooks/useFlow';
import { useDraft } from '../../src/ui/hooks/useDraft';
import {
  __resetSessionForTests,
  currentContext,
  ensureRunning,
  getOrCreateContext,
  isRunning,
  unlockAudio,
} from '../../src/audio/session';
import { loadEngine, type EngineResult } from '../../src/audio/engine';
import { playWaveform, type PlaybackHandle } from '../../src/audio/transmit';
import { HOLD_DURATION_MS } from '../../src/logic/hold-machine';

vi.mock('../../src/audio/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/engine')>();
  return { ...actual, loadEngine: vi.fn() };
});
vi.mock('../../src/audio/transmit', () => ({ playWaveform: vi.fn() }));

const loadEngineMock = vi.mocked(loadEngine);
const playWaveformMock = vi.mocked(playWaveform);

const FAKE_ENGINE: EngineResult = {
  ok: true,
  engine: {
    encode: () => new Float32Array(480),
    decode: () => null,
  },
};
const FAKE_HANDLE: PlaybackHandle = {
  durationSec: 1,
  elapsedSec: () => 0,
  stop: () => undefined,
  finished: new Promise(() => undefined),
};

/** Minimal AudioContext stand-in. `onResume` decides what each resume() does. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static onResume: (ctx: FakeAudioContext) => Promise<void> = () => Promise.resolve();
  state: AudioContextState = 'suspended';
  sampleRate = 44100;
  resumeCalls = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume(): Promise<void> {
    this.resumeCalls += 1;
    return FakeAudioContext.onResume(this);
  }
}

let unlockSpy: ReturnType<typeof vi.fn<typeof unlockAudio>>;
let transmissions: TransmissionOutcome[];

function Harness(): ReactElement {
  const flow = useFlow();
  const draft = useDraft();
  const { dispatch } = flow;
  useEffect(() => {
    dispatch({ type: 'micResult', status: 'granted' });
  }, [dispatch]);
  const audio = {
    unlockAudio: unlockSpy,
    ensureRunning,
    isRunning,
    context: currentContext,
  };
  return createElement(
    'div',
    null,
    createElement(Speak, {
      flow,
      audio,
      draft,
      onTransmission: (o: TransmissionOutcome) => transmissions.push(o),
    }),
    createElement('output', { 'data-testid': 'screen' }, flow.state.screen),
  );
}

const screenName = (): string | null => screen.getByTestId('screen').textContent;
const keyButton = (): HTMLElement => screen.getByRole('button', { name: /screech/i });
const textarea = (): HTMLTextAreaElement => screen.getByLabelText('Your whisper') as HTMLTextAreaElement;

/** Mounts Speak with a written message, then holds the SCREECH key past the hold time. */
async function mountAndHold(): Promise<void> {
  await act(async () => {
    render(createElement(Harness));
  });
  fireEvent.change(textarea(), { target: { value: 'hello from the other side' } });
  fireEvent.keyDown(keyButton(), { key: ' ' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(HOLD_DURATION_MS + 200);
  });
  fireEvent.keyUp(keyButton(), { key: ' ' });
}

beforeEach(() => {
  // performance.now() times the hold, so it must be faked with the timers.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
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
  FakeAudioContext.instances = [];
  FakeAudioContext.onResume = () => Promise.resolve();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  __resetSessionForTests();
  transmissions = [];
  loadEngineMock.mockReset();
  loadEngineMock.mockResolvedValue(FAKE_ENGINE);
  playWaveformMock.mockReset();
  playWaveformMock.mockReturnValue(FAKE_HANDLE);
  unlockSpy = vi.fn<typeof unlockAudio>(unlockAudio);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetSessionForTests();
});

describe('Speak wake control', () => {
  it('suspended at fire: shows the wake control, then one transmission after the tap', async () => {
    const ctx = getOrCreateContext() as unknown as FakeAudioContext;
    const pending: Array<() => void> = [];
    FakeAudioContext.onResume = () =>
      new Promise<void>((resolve) => {
        pending.push(resolve);
      });

    await mountAndHold();

    // The key press (a gesture) may call resume(); the hold timer must not.
    const callsAfterPress = ctx.resumeCalls;
    expect(callsAfterPress).toBe(1);
    expect(screen.getByText(MSG_WAKE_SLEEPING)).toBeTruthy();
    expect(screen.getByRole('button', { name: WAKE_LABEL })).toBeTruthy();
    expect(playWaveformMock).not.toHaveBeenCalled();
    expect(transmissions).toHaveLength(0);
    expect(screenName()).toBe('speak');
    expect(textarea().value).toBe('hello from the other side');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(ctx.resumeCalls).toBe(callsAfterPress);

    // The browser finishes resuming the context.
    await act(async () => {
      ctx.state = 'running';
      pending.forEach((resolve) => resolve());
    });
    expect(playWaveformMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: WAKE_LABEL })).toBeTruthy();

    // Tap: unlockAudio() is called synchronously inside the click.
    fireEvent.click(screen.getByRole('button', { name: WAKE_LABEL }));
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(playWaveformMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(playWaveformMock).toHaveBeenCalledTimes(1);
    expect(transmissions).toHaveLength(1);
    expect(transmissions[0]?.ok).toBe(true);
    expect(screenName()).toBe('screeching');
    expect(screen.queryByRole('button', { name: WAKE_LABEL })).toBeNull();
  });

  it('resume leaves the context suspended: control stays, error shown, nothing plays', async () => {
    const ctx = getOrCreateContext() as unknown as FakeAudioContext;
    await mountAndHold();
    expect(screen.getByRole('button', { name: WAKE_LABEL })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: WAKE_LABEL }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(ctx.state).toBe('suspended');
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: WAKE_LABEL })).toBeTruthy();
    expect(screen.getByText(MSG_WAKE_FAILED)).toBeTruthy();
    expect(playWaveformMock).not.toHaveBeenCalled();
    expect(transmissions).toHaveLength(0);
    expect(screenName()).toBe('speak');
  });

  it('running at fire: transmits at once, no wake control, no resume from the timer', async () => {
    const ctx = getOrCreateContext() as unknown as FakeAudioContext;
    ctx.state = 'running';

    await mountAndHold();

    expect(playWaveformMock).toHaveBeenCalledTimes(1);
    expect(transmissions).toHaveLength(1);
    expect(screenName()).toBe('screeching');
    expect(screen.queryByRole('button', { name: WAKE_LABEL })).toBeNull();
    expect(screen.queryByText(MSG_WAKE_SLEEPING)).toBeNull();
    expect(ctx.resumeCalls).toBe(0);
    expect(unlockSpy).not.toHaveBeenCalled();
  });
});
