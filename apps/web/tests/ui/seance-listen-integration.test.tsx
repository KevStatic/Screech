// Feature: seance, task 11.9: Listen routing, repeat packets and silence on Join and Lit
// (Requirements 13.1, 13.9, 13.10, 13.11)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { buildCheckin, encode } from '@screech/core';
import Listen, { resetListenDedupe, type ListenProps } from '../../src/ui/screens/Listen';
import { INITIAL_FLOW_STATE } from '../../src/logic/flow';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import { takeListenStart } from '../../src/ui/hooks/listen-handoff';
import { resetProgressStoreForTests } from '../../src/ui/hooks/progress-store';
import { hauntPlayer } from '../../src/audio/haunt-player';
import type { CaptureHandle, CaptureHandlers } from '../../src/audio/capture';
import type { UnlockOutcome } from '../../src/audio/session';
import { openMic, type MicResult } from '../../src/audio/mic';

vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn() };
});

const openMicMock = vi.mocked(openMic);
const UNLOCK_OK = { ok: true, sampleRate: 44100 } as unknown as UnlockOutcome;

const SESSION = 'ABCDEFGH';
const OTHER_SESSION = 'JKMNPQRS';

function checkinBytes(sessionId: string, code: string): Uint8Array {
  const built = buildCheckin({ sessionId, code });
  if (!built.ok) throw new Error('buildCheckin failed');
  return built.value;
}

interface Fakes {
  readonly props: ListenProps;
  readonly dispatch: ReturnType<typeof vi.fn>;
  readonly stopListening: ReturnType<typeof vi.fn>;
  readonly unlockAudio: ReturnType<typeof vi.fn>;
  handlers: () => CaptureHandlers;
}

function makeFakes(): Fakes {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  openMicMock.mockResolvedValue({ ok: true, stream } satisfies MicResult);
  const analyser = {
    frequencyBinCount: 512,
    fftSize: 1024,
    getByteFrequencyData: (data: Uint8Array): void => data.fill(0),
  } as unknown as AnalyserNode;
  const handle = { analyser, lastBlockAt: () => 0 } as unknown as CaptureHandle;
  let captured: CaptureHandlers | null = null;
  const dispatch = vi.fn();
  const unlockAudio = vi.fn(() => Promise.resolve(UNLOCK_OK));
  const startListening = vi.fn((_s: MediaStream, h: CaptureHandlers) => {
    captured = h;
    return Promise.resolve({ ok: true as const, handle });
  });
  const stopListening = vi.fn();
  const props: ListenProps = {
    flow: { state: { ...INITIAL_FLOW_STATE, screen: 'listen', listening: true }, dispatch },
    audio: {
      unlockAudio,
      context: () => null,
      listenStatus: { kind: 'idle' },
      startListening,
      stopListening,
      captureHandle: () => handle,
    } as unknown as ListenProps['audio'],
    now: () => 1000,
  };
  return {
    props,
    dispatch,
    stopListening,
    unlockAudio,
    handlers: () => {
      if (captured === null) throw new Error('capture not started');
      return captured;
    },
  };
}

async function start(fakes: Fakes): Promise<void> {
  render(createElement(Listen, fakes.props));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /start listening/i }));
  });
}

function hear(fakes: Fakes, bytes: Uint8Array): void {
  act(() => {
    fakes.handlers().onPacketBytes(bytes);
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;
let audioContextCtor: ReturnType<typeof vi.fn>;
let audioCtor: ReturnType<typeof vi.fn>;
let playSpy: ReturnType<typeof vi.spyOn>;

function publicCalls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith('/public'));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  openMicMock.mockReset();
  resetProgressStoreForTests();
  resetListenDedupe();
  takeListenStart();
  setExorcise(false);
  const backing = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string): string | null => backing.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        backing.set(k, v);
      },
      removeItem: (k: string): void => {
        backing.delete(k);
      },
    },
  });

  fetchMock = vi.fn((input: unknown) => {
    const url = String(input);
    if (url.endsWith('/public')) return Promise.resolve(jsonResponse(200, { title: 'Quiet Hour', open: true }));
    if (url.endsWith('/checkin')) {
      return Promise.resolve(
        jsonResponse(200, { name: 'Mara', at: '2026-01-01T00:00:00.000Z', alreadyCheckedIn: false }),
      );
    }
    return Promise.resolve(jsonResponse(404, {}));
  });
  vi.stubGlobal('fetch', fetchMock);
  audioContextCtor = vi.fn();
  audioCtor = vi.fn();
  vi.stubGlobal('AudioContext', audioContextCtor);
  vi.stubGlobal('webkitAudioContext', audioContextCtor);
  vi.stubGlobal('Audio', audioCtor);
  playSpy = vi.spyOn(hauntPlayer, 'play');
});

afterEach(() => {
  cleanup();
  takeListenStart();
  setExorcise(false);
  vi.unstubAllGlobals();
  playSpy?.mockRestore();
});

describe('Listen routes check-in packets', () => {
  it('a parsing checkin Packet stops capture and opens Join with one public request', async () => {
    const fakes = makeFakes();
    await start(fakes);

    hear(fakes, checkinBytes(SESSION, '012345'));
    await settle();

    expect(fakes.stopListening).toHaveBeenCalledTimes(1);
    expect(fakes.dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('join-title').textContent).toBe('Quiet Hour');
    expect(publicCalls()).toEqual([`/api/seance/${SESSION}/public`]);
    expect(screen.queryByTestId('listen-label')).toBeNull();
  });

  it('a malformed checkin Packet goes to Reveal and never opens Join', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const bad = encode({ type: 'checkin', text: 'S1:not-a-session' });
    if (!bad.ok) throw new Error('encode failed');

    hear(fakes, bad.value);
    await settle();

    expect(screen.queryByTestId('join-title')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    const sent = fakes.dispatch.mock.calls[0]?.[0] as { type: string; state: { kind: string } };
    expect(sent.type).toBe('received');
    expect(['reveal', 'garbled']).toContain(sent.state.kind);
    expect(fakes.stopListening).toHaveBeenCalledTimes(1);
  });

  it('a malformed checkin Packet with a valid-looking prefix but a bad code goes to Reveal', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const bad = encode({ type: 'checkin', text: `S1:${SESSION}:12345X` });
    if (!bad.ok) throw new Error('encode failed');

    hear(fakes, bad.value);
    await settle();

    expect(screen.queryByTestId('join-title')).toBeNull();
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('Repeat packets while Join is open', () => {
  it('a repeat packet for the same séance sends no second public request', async () => {
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, checkinBytes(SESSION, '111111'));
    await settle();
    expect(publicCalls()).toHaveLength(1);

    hear(fakes, checkinBytes(SESSION, '222222'));
    await settle();

    expect(publicCalls()).toHaveLength(1);
    expect(screen.getByTestId('join-title').textContent).toBe('Quiet Hour');
    expect(fakes.dispatch).not.toHaveBeenCalled();
  });

  it('the repeat packet replaces the code that Join sends', async () => {
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, checkinBytes(SESSION, '111111'));
    await settle();
    hear(fakes, checkinBytes(SESSION, '222222'));
    await settle();

    fireEvent.change(screen.getByTestId('join-name'), { target: { value: 'Mara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-button'));
    });
    await settle();

    const post = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/checkin'));
    expect(post).toBeDefined();
    const body = JSON.parse(String((post?.[1] as RequestInit).body)) as { code: string };
    expect(body.code).toBe('222222');
  });

  it('a packet for another séance is ignored on Join', async () => {
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, checkinBytes(SESSION, '111111'));
    await settle();

    hear(fakes, checkinBytes(OTHER_SESSION, '333333'));
    await settle();

    expect(publicCalls()).toEqual([`/api/seance/${SESSION}/public`]);
    expect(fakes.dispatch).not.toHaveBeenCalled();
  });
});

describe('No UI_Sound on Join or Lit', () => {
  it('plays nothing and creates no audio object on Join, then on Lit', async () => {
    const fakes = makeFakes();
    await start(fakes);
    // Listen itself may have asked for an unlock through its own prop; only count what happens after this.
    audioContextCtor.mockClear();
    audioCtor.mockClear();
    playSpy.mockClear();

    hear(fakes, checkinBytes(SESSION, '012345'));
    await settle();
    expect(screen.getByTestId('join-title')).toBeTruthy();
    expect(document.querySelector('audio')).toBeNull();

    fireEvent.change(screen.getByTestId('join-name'), { target: { value: 'Mara' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('join-button'));
    });
    await settle();

    expect(screen.getByTestId('lit-name').textContent).toBe('Mara');
    expect(document.querySelector('audio')).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();
    expect(audioContextCtor).not.toHaveBeenCalled();
    expect(audioCtor).not.toHaveBeenCalled();
    expect(fakes.unlockAudio).toHaveBeenCalledTimes(1);
  });
});
