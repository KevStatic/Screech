// Feature: ghost-hunt, task 9.8: Beacon and BeaconError screens
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ClueFields } from '@screech/core';
import Beacon, {
  LABEL_START_BEACON,
  LABEL_WAKE_TAP,
  TEXT_WAKE_HELD,
  TEXT_WAKE_RELEASED,
  TEXT_WAKE_UNAVAILABLE,
} from '../../src/ui/screens/Beacon';
import BeaconError, { LABEL_OPEN_NORMAL } from '../../src/ui/screens/BeaconError';
import { QUIET_MESSAGE, type BeaconDeps } from '../../src/ui/hooks/useBeacon';
import { HOLD_DURATION_MS } from '../../src/logic/hold-machine';
import { hauntPlayer } from '../../src/audio/haunt-player';
import type { PlaybackHandle } from '../../src/audio/transmit';
import type { WakeStatus } from '../../src/audio/wake-lock';

const FIELDS: ClueFields = {
  huntId: 'ABCDEF',
  index: 2,
  total: 5,
  name: 'Mara',
  clue: 'Look under the stairs',
};

interface Rig {
  deps: Partial<BeaconDeps>;
  ctx: { state: 'running' | 'suspended'; sampleRate: number };
  unlockAudio: ReturnType<typeof vi.fn>;
  playWaveform: ReturnType<typeof vi.fn>;
  handleStop: ReturnType<typeof vi.fn>;
  wakeAcquire: ReturnType<typeof vi.fn>;
  emitWake: (status: WakeStatus) => void;
}

function makeRig(wakeResult: WakeStatus = 'held'): Rig {
  const ctx = { state: 'running' as 'running' | 'suspended', sampleRate: 44100 };
  const handleStop = vi.fn();
  let listener: (status: WakeStatus) => void = () => undefined;
  const unlockAudio = vi.fn(() => Promise.resolve({ ok: true as const, ctx, sampleRate: 44100 }));
  const playWaveform = vi.fn((): PlaybackHandle => ({
    durationSec: 1,
    elapsedSec: () => 0,
    stop: handleStop,
    finished: new Promise(() => undefined),
  }));
  const wakeAcquire = vi.fn(() => Promise.resolve(wakeResult));
  return {
    ctx,
    unlockAudio,
    playWaveform,
    handleStop,
    wakeAcquire,
    emitWake: (status) => listener(status),
    deps: {
      unlockAudio: unlockAudio as unknown as BeaconDeps['unlockAudio'],
      ensureRunning: () => Promise.resolve(),
      currentContext: () => ctx as unknown as AudioContext,
      loadEngine: () =>
        Promise.resolve({
          ok: true as const,
          engine: { encode: () => new Float32Array(8), decode: () => null },
        }),
      playWaveform: playWaveform as unknown as BeaconDeps['playWaveform'],
      wake: {
        acquire: wakeAcquire,
        release: () => Promise.resolve(),
        onChange: (cb) => {
          listener = cb;
          return () => undefined;
        },
      },
      now: () => Date.now(),
      random: () => 0,
      transmitVolume: 10,
    },
  };
}

async function mount(rig: Rig, fields: ClueFields = FIELDS): Promise<void> {
  await act(async () => {
    render(createElement(Beacon, { fields, deps: rig.deps }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function startBeacon(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: LABEL_START_BEACON }));
  await advance(100);
}

const stopKey = (): HTMLElement => screen.getByTestId('beacon-stop');

describe('Beacon', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let audioContextCtor: ReturnType<typeof vi.fn>;
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // performance.now() times the hold, so it is faked with the timers.
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
    // jsdom has no PointerEvent. Without it the event loses its `button` field.
    if (typeof window.PointerEvent === 'undefined') {
      Object.defineProperty(window, 'PointerEvent', {
        configurable: true,
        writable: true,
        value: MouseEvent,
      });
    }
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    audioContextCtor = vi.fn();
    vi.stubGlobal('AudioContext', audioContextCtor);
    playSpy = vi.spyOn(hauntPlayer, 'play');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the Spirit, name and hunt, with no clue, no mic and no sound before the tap', async () => {
    const rig = makeRig();
    await mount(rig);
    await advance(60_000);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Spirit 2 of 5');
    expect(screen.getByTestId('beacon-name').textContent).toBe('Mara');
    expect(screen.getByTestId('beacon-hunt-id').textContent).toContain('ABCDEF');
    expect(screen.queryByTestId('beacon-clue')).toBeNull();
    expect(screen.queryByTestId('beacon-stop')).toBeNull();
    expect(rig.unlockAudio).not.toHaveBeenCalled();
    expect(rig.playWaveform).not.toHaveBeenCalled();
    expect(audioContextCtor).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('renders markup in a name as plain text', async () => {
    const rig = makeRig();
    await mount(rig, { ...FIELDS, name: '<b>Mara</b>' });
    const name = screen.getByTestId('beacon-name');
    expect(name.textContent).toBe('<b>Mara</b>');
    expect(name.querySelector('b')).toBeNull();
  });

  it('start tap unlocks audio, shows the clue, screeches and never asks for the mic', async () => {
    const rig = makeRig();
    await mount(rig);
    await startBeacon();
    expect(rig.unlockAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('beacon-clue').textContent).toBe(FIELDS.clue);
    expect(rig.playWaveform).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('beacon-status').textContent).toMatch(/screeching now/i);
    expect(screen.getByTestId('beacon-volume').textContent).toMatch(/volume/i);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(audioContextCtor).not.toHaveBeenCalled();
  });

  it('a tap on STOP does nothing', async () => {
    const rig = makeRig();
    await mount(rig);
    await startBeacon();
    fireEvent.pointerDown(stopKey(), { button: 0 });
    await advance(50);
    fireEvent.pointerUp(stopKey(), { button: 0 });
    fireEvent.click(stopKey());
    await advance(HOLD_DURATION_MS * 2);
    expect(screen.getByTestId('beacon-clue')).toBeTruthy();
    expect(rig.handleStop).not.toHaveBeenCalled();
  });

  it('a hold on STOP stops the beacon, cuts the sound and hides the clue', async () => {
    const rig = makeRig();
    await mount(rig);
    await startBeacon();
    fireEvent.pointerDown(stopKey(), { button: 0 });
    await advance(HOLD_DURATION_MS + 100);
    expect(rig.handleStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('beacon-clue')).toBeNull();
    expect(screen.getByRole('button', { name: LABEL_START_BEACON })).toBeTruthy();
    const plays = rig.playWaveform.mock.calls.length;
    await advance(60_000);
    expect(rig.playWaveform.mock.calls.length).toBe(plays);
  });

  it.each([
    ['held', TEXT_WAKE_HELD],
    ['rejected', TEXT_WAKE_UNAVAILABLE],
    ['unsupported', TEXT_WAKE_UNAVAILABLE],
  ] as const)('shows the wake text for %s', async (status, text) => {
    const rig = makeRig(status);
    await mount(rig);
    await startBeacon();
    expect(screen.getByTestId('beacon-wake').textContent).toBe(text);
  });

  it('shows the wake text when the browser releases the lock', async () => {
    const rig = makeRig('held');
    await mount(rig);
    await startBeacon();
    await act(async () => {
      rig.emitWake('released');
    });
    expect(screen.getByTestId('beacon-wake').textContent).toBe(TEXT_WAKE_RELEASED);
  });

  it('goes quiet when audio is suspended, and one wake tap resumes the screeches', async () => {
    const rig = makeRig();
    rig.ctx.state = 'suspended';
    await mount(rig);
    await startBeacon();
    await advance(1000);
    expect(screen.getByTestId('beacon-quiet').textContent).toContain(QUIET_MESSAGE);
    expect(rig.playWaveform).not.toHaveBeenCalled();

    rig.ctx.state = 'running';
    const unlocks = rig.unlockAudio.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: LABEL_WAKE_TAP }));
    expect(rig.unlockAudio.mock.calls.length).toBe(unlocks + 1);
    await advance(100);
    expect(screen.queryByTestId('beacon-quiet')).toBeNull();
    expect(rig.playWaveform).toHaveBeenCalledTimes(1);
  });

  it('plays no Haunting Sound', async () => {
    const rig = makeRig();
    await mount(rig);
    await startBeacon();
    fireEvent.pointerDown(stopKey(), { button: 0 });
    await advance(HOLD_DURATION_MS + 100);
    expect(playSpy).not.toHaveBeenCalled();
  });
});

describe('BeaconError', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    window.history.replaceState(null, '', '/beacon#abc123');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it.each([
    'Too heavy to cross over (148/140 bytes)',
    'This link is cut short. Ask the host for a new one.',
  ])('shows "%s" with only the open-normal-app control', (message) => {
    render(createElement(BeaconError, { message, onOpenNormal: () => undefined }));
    expect(screen.getByTestId('beacon-error-message').textContent).toBe(message);
    expect(screen.getByRole('button', { name: LABEL_OPEN_NORMAL })).toBeTruthy();
    expect(screen.queryByTestId('beacon-start')).toBeNull();
    expect(screen.queryByRole('button', { name: LABEL_START_BEACON })).toBeNull();
  });

  it('open-normal removes the fragment and calls onOpenNormal', () => {
    const onOpenNormal = vi.fn();
    render(createElement(BeaconError, { message: 'x', onOpenNormal }));
    expect(window.location.hash).toBe('#abc123');
    fireEvent.click(screen.getByTestId('beacon-open-normal'));
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/beacon');
    expect(onOpenNormal).toHaveBeenCalledTimes(1);
  });
});
