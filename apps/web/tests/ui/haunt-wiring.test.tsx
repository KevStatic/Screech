// Feature: haunting-sounds, task 11.5: per-screen wiring against a stubbed hauntPlayer
// Requirements 6.2, 7.3, 7.4, 7.5, 7.6, 8.4, 8.6, 8.7, 8.8, 9.1
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import type { Payload } from '@screech/core';
import Awaken from '../../src/ui/screens/Awaken';
import Speak from '../../src/ui/screens/Speak';
import Reveal from '../../src/ui/screens/Reveal';
import Garbled from '../../src/ui/screens/Garbled';
import Sealed from '../../src/ui/screens/Sealed';
import Listen, { resetListenDedupe, type ListenProps } from '../../src/ui/screens/Listen';
import Screeching from '../../src/ui/screens/Screeching';
import OuijaBoard from '../../src/ui/components/OuijaBoard';
import { useFlow } from '../../src/ui/hooks/useFlow';
import { useDraft } from '../../src/ui/hooks/useDraft';
import { INITIAL_FLOW_STATE } from '../../src/logic/flow';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import { scrapeSeed } from '../../src/logic/haunt-synth';
import type { Env } from '../../src/logic/capabilities';
import type { UnlockOutcome } from '../../src/audio/session';
import type { PlaybackHandle, PlaybackResult } from '../../src/audio/transmit';
import type { CaptureHandle } from '../../src/audio/capture';

const { player, order } = vi.hoisted(() => ({
  player: {
    update: vi.fn(),
    noteAwakenTap: vi.fn(),
    setDroneWanted: vi.fn(),
    play: vi.fn(),
    stopOneShots: vi.fn(),
    stopKind: vi.fn(),
    dispose: vi.fn(),
  },
  order: { log: [] as string[] },
}));

vi.mock('../../src/audio/haunt-player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/haunt-player')>();
  return { ...actual, hauntPlayer: player };
});

vi.mock('../../src/ui/hooks/useSoundHint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/hooks/useSoundHint')>();
  return {
    ...actual,
    markAwakenTapped: vi.fn(() => {
      order.log.push('markAwakenTapped');
    }),
  };
});

const UNLOCK_OK = { ok: true } as unknown as UnlockOutcome;
const INSECURE_ENV: Env = {
  hasWasm: true,
  hasWebAudio: true,
  isSecureContext: false,
  hasGetUserMedia: true,
};

const playsOf = (name: string): unknown[][] =>
  player.play.mock.calls.filter((c) => c[0] === name);

function AwakenHarness(): ReactElement {
  const flow = useFlow();
  const unlockAudio = (): Promise<UnlockOutcome> => {
    order.log.push('unlockAudio');
    return Promise.resolve(UNLOCK_OK);
  };
  return createElement(Awaken, { flow, audio: { unlockAudio }, env: INSECURE_ENV });
}

function SpeakHarness(): ReactElement {
  const flow = useFlow();
  const draft = useDraft();
  return createElement(Speak, {
    flow,
    audio: {
      unlockAudio: () => Promise.resolve(UNLOCK_OK),
      ensureRunning: () => Promise.resolve(),
      isRunning: () => false,
      context: () => null,
    },
    draft,
    onTransmission: () => undefined,
  });
}

const noop = vi.fn();

function revealElement(text: string): ReactElement {
  const payload = { type: 'text', text } as Payload;
  const state = {
    ...INITIAL_FLOW_STATE,
    screen: 'reveal',
    received: { kind: 'reveal', packet: { multipart: false, payload } },
  } as unknown as typeof INITIAL_FLOW_STATE;
  return createElement(Reveal, { flow: { state, dispatch: noop } });
}

function listenElement(): ReactElement {
  const handle = { analyser: null, lastBlockAt: () => 0 } as unknown as CaptureHandle;
  const props: ListenProps = {
    flow: { state: { ...INITIAL_FLOW_STATE, screen: 'listen', listening: true }, dispatch: noop },
    audio: {
      unlockAudio: () => Promise.resolve(UNLOCK_OK),
      context: () => null,
      listenStatus: { kind: 'idle' },
      startListening: () => Promise.resolve({ ok: true as const, handle }),
      stopListening: () => undefined,
      captureHandle: () => handle,
    } as unknown as ListenProps['audio'],
    now: () => 1000,
  };
  return createElement(Listen, props);
}

function screechingElement(): ReactElement {
  const handle: PlaybackHandle = {
    durationSec: 10,
    elapsedSec: () => 0,
    stop: () => undefined,
    finished: new Promise<PlaybackResult>(() => undefined),
  };
  return createElement(Screeching, {
    flow: { dispatch: noop },
    outcome: { ok: true, handle, sampleRate: 48000, wave: new Float32Array(480000) },
  });
}

const SCREENS: readonly (readonly [string, () => ReactElement])[] = [
  ['Awaken', () => createElement(AwakenHarness)],
  ['Speak', () => createElement(SpeakHarness)],
  ['Listen', listenElement],
  ['Screeching', screechingElement],
  ['Reveal', () => revealElement('HELLO WORLD')],
  ['Garbled', () => createElement(Garbled, { flow: { dispatch: noop } })],
  ['Sealed', () => createElement(Sealed, { flow: { dispatch: noop } })],
];

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
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  for (const fn of Object.values(player)) fn.mockReset();
  order.log = [];
  player.noteAwakenTap.mockImplementation(() => {
    order.log.push('noteAwakenTap');
  });
  resetListenDedupe();
  setExorcise(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setExorcise(false);
});

describe('Awaken', () => {
  it('calls unlockAudio synchronously, then noteAwakenTap, then markAwakenTapped', async () => {
    render(createElement(AwakenHarness));
    fireEvent.click(screen.getByRole('button', { name: /^awaken$/i }));
    expect(order.log).toEqual(['unlockAudio']);
    await act(async () => {
      await Promise.resolve();
    });
    expect(order.log).toEqual(['unlockAudio', 'noteAwakenTap', 'markAwakenTapped']);
    expect(player.noteAwakenTap).toHaveBeenCalledWith(UNLOCK_OK);
  });
});

describe('Speak', () => {
  it('flips the card sound only for a new card', () => {
    render(createElement(SpeakHarness));
    fireEvent.click(screen.getByRole('button', { name: /whisper/i })); // already selected
    expect(playsOf('card-flip')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /portal/i }));
    expect(playsOf('card-flip')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /portal/i })); // same card again
    expect(playsOf('card-flip')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /ether/i }));
    expect(playsOf('card-flip')).toHaveLength(2);
  });

  it('crackles when the byte size changes and not when it stays the same', () => {
    render(createElement(SpeakHarness));
    expect(playsOf('candle-crackle')).toHaveLength(0);
    const box = screen.getByLabelText(/your whisper/i);
    fireEvent.change(box, { target: { value: 'ab' } });
    expect(playsOf('candle-crackle')).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'ba' } }); // same size, new text
    expect(playsOf('candle-crackle')).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(playsOf('candle-crackle')).toHaveLength(2);
  });

  it('holds the drone while open and releases it on unmount', () => {
    const { unmount } = render(createElement(SpeakHarness));
    expect(player.setDroneWanted).toHaveBeenLastCalledWith(true);
    unmount();
    expect(player.setDroneWanted).toHaveBeenLastCalledWith(false);
  });
});

describe('Reveal and OuijaBoard', () => {
  const LETTERS_40 = Array.from({ length: 40 }, (_, i) =>
    String.fromCharCode(65 + (i % 26)),
  ).join(' ');

  function useTimers(): void {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'],
    });
  }
  function tick(ms: number, step = 40): void {
    for (let t = 0; t < ms; t += step) {
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  }

  it('40 spaced Letters give 30 scrapes and one whisper', () => {
    useTimers();
    render(revealElement(LETTERS_40));
    tick(15000);
    const scrapes = playsOf('planchette-scrape');
    expect(scrapes).toHaveLength(30);
    expect(playsOf('whisper')).toHaveLength(1);
    // Each scrape is seeded from its letter index only.
    const seeds = scrapes.map((c) => (c[1] as { seed: number }).seed);
    expect(new Set(seeds).size).toBe(30);
    expect(seeds).toContain(scrapeSeed(0));
  });

  it('Reveal and OuijaBoard show the same text at the same time', () => {
    useTimers();
    const { unmount } = render(revealElement('HELLO WORLD'));
    tick(500);
    const fromReveal = screen.getByTestId('ouija-spelled').textContent;
    unmount();
    render(createElement(OuijaBoard, { value: 'HELLO WORLD', elapsedMs: 500 }));
    expect(screen.getByTestId('ouija-spelled').textContent).toBe(fromReveal);
    expect(fromReveal?.startsWith('HELLO')).toBe(true);
    expect(fromReveal?.length).toBeLessThan('HELLO WORLD'.length);
    cleanup();
    render(revealElement('HELLO WORLD'));
    tick(3000);
    expect(screen.getByTestId('ouija-spelled').textContent).toBe(
      screen.getByTestId('reveal-full-text').textContent,
    );
  });

  it('skip stops the scrapes, plays no more, and plays one whisper', () => {
    useTimers();
    render(revealElement(LETTERS_40));
    tick(400);
    const before = playsOf('planchette-scrape').length;
    expect(before).toBeGreaterThan(0);
    expect(playsOf('whisper')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('reveal-skip'));
    expect(player.stopKind).toHaveBeenCalledWith('planchette-scrape');
    tick(5000);
    expect(playsOf('planchette-scrape')).toHaveLength(before);
    expect(playsOf('whisper')).toHaveLength(1);
  });

  it('plays no scrapes under reduced motion', () => {
    setExorcise(true);
    render(revealElement(LETTERS_40));
    expect(playsOf('planchette-scrape')).toHaveLength(0);
  });
});

describe('Garbled, Sealed, Listen, Screeching', () => {
  it('Garbled plays broken-crackle once', () => {
    render(createElement(Garbled, { flow: { dispatch: noop } }));
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(playsOf('broken-crackle')).toHaveLength(1);
  });

  it('Sealed plays sealed-thud once', () => {
    render(createElement(Sealed, { flow: { dispatch: noop } }));
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(playsOf('sealed-thud')).toHaveLength(1);
  });

  it('Listen plays nothing', () => {
    render(listenElement());
    expect(player.play).not.toHaveBeenCalled();
    expect(player.setDroneWanted).not.toHaveBeenCalledWith(true);
  });

  it('Screeching plays nothing', () => {
    render(screechingElement());
    expect(player.play).not.toHaveBeenCalled();
    expect(player.setDroneWanted).not.toHaveBeenCalledWith(true);
  });
});

describe('Sound toggle placement', () => {
  it.each(SCREENS)('%s has exactly one Sound toggle, before Exorcise', (_name, make) => {
    render(make());
    const labels = screen.getAllByRole('switch').map((s) => s.textContent ?? '');
    const sound = labels.filter((l) => l.startsWith('Sound'));
    expect(sound).toHaveLength(1);
    const soundAt = labels.findIndex((l) => l.startsWith('Sound'));
    const exorciseAt = labels.findIndex((l) => l.startsWith('Exorcise'));
    expect(exorciseAt).toBeGreaterThan(-1);
    expect(soundAt).toBeLessThan(exorciseAt);
  });
});
