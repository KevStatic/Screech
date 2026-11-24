// Feature: ghost-hunt, task 9.10: Listen with Hunt packets
// (Requirements 10.1 to 10.4, 10.7, 10.8, 10.9, 10.11, 10.12, 10.13, 10.15, 10.16, 10.17)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { buildClue, encode } from '@screech/core';
import type { ClueFieldsInput } from '@screech/core';
import Listen, {
  LABEL_LISTENING,
  MSG_AUDIO_FAILED,
  resetListenDedupe,
  type ListenProps,
} from '../../src/ui/screens/Listen';
import { INITIAL_FLOW_STATE } from '../../src/logic/flow';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import { queueListenStart, takeListenStart } from '../../src/ui/hooks/listen-handoff';
import { getProgressStore, resetProgressStoreForTests } from '../../src/ui/hooks/progress-store';
import type { CaptureHandle, CaptureHandlers } from '../../src/audio/capture';
import type { UnlockOutcome } from '../../src/audio/session';
import { openMic, type MicResult } from '../../src/audio/mic';

vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn() };
});

const openMicMock = vi.mocked(openMic);
const UNLOCK_OK = { ok: true, sampleRate: 44100 } as unknown as UnlockOutcome;

const HUNT = 'ABCDEF';
const TOTAL = 5;

function clueInput(index: number, name: string, clue = `Look behind door ${index}`): ClueFieldsInput {
  return { huntId: HUNT, index, total: TOTAL, name, clue };
}

function clueBytes(index: number, name: string, clue?: string): Uint8Array {
  const built = buildClue(clueInput(index, name, clue));
  if (!built.ok) throw new Error('buildClue failed');
  return built.value;
}

/** Saves a Hunt with the given Spirits already found. */
function seedFound(found: ReadonlyArray<readonly [number, string]>): void {
  getProgressStore().save({
    huntId: HUNT,
    total: TOTAL,
    found: found.map(([index, name]) => ({ index, name })),
    firstFoundAt: 500,
    completedAt: null,
  });
}

interface Fakes {
  readonly props: ListenProps;
  readonly dispatch: ReturnType<typeof vi.fn>;
  readonly unlockAudio: ReturnType<typeof vi.fn>;
  readonly startListening: ReturnType<typeof vi.fn>;
  readonly stopListening: ReturnType<typeof vi.fn>;
  readonly clock: { t: number };
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
  const clock = { t: 1000 };
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
    now: () => clock.t,
  };
  return {
    props,
    dispatch,
    unlockAudio,
    startListening,
    stopListening,
    clock,
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

const noteEl = (): HTMLElement => screen.getByTestId('already-note');
const noteText = (): string => noteEl().querySelector('[role="status"]')?.textContent ?? '';

const backing = new Map<string, string>();
const setItem = vi.fn((key: string, value: string): void => {
  backing.set(key, value);
});
const fakeStorage = {
  getItem: (key: string): string | null => backing.get(key) ?? null,
  setItem,
  removeItem: (key: string): void => {
    backing.delete(key);
  },
};

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
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  openMicMock.mockReset();
  backing.clear();
  setItem.mockClear();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fakeStorage });
  resetProgressStoreForTests();
  resetListenDedupe();
  takeListenStart();
  setExorcise(false);
});

afterEach(() => {
  cleanup();
  takeListenStart();
  setExorcise(false);
});

describe('Listen with an already found Hunt clue', () => {
  it('shows the exact note above the K-II meter, keeps capture running and writes nothing', async () => {
    seedFound([[2, 'Mara']]);
    const fakes = makeFakes();
    await start(fakes);
    setItem.mockClear();

    hear(fakes, clueBytes(2, 'Someone Else'));

    expect(noteText()).toBe('Already found \u00b7 Spirit 2 of 5 \u00b7 Mara');
    const meter = screen.getByTestId('kii-meter');
    expect(noteEl().compareDocumentPosition(meter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fakes.stopListening).not.toHaveBeenCalled();
    expect(fakes.dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.querySelector('audio')).toBeNull();
  });

  it('Read clue again shows the clue as plain text, and it is not a link', async () => {
    seedFound([[2, 'Mara']]);
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, clueBytes(2, 'Mara', 'Open https://example.com now'));
    expect(screen.queryByTestId('already-note-clue')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Read clue again' }));

    const clue = screen.getByTestId('already-note-clue');
    expect(clue.textContent).toBe('Open https://example.com now');
    expect(clue.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read clue again' })).toBeNull();
  });

  it('the same Spirit heard again leaves the note and shown clue unchanged', async () => {
    seedFound([[2, 'Mara']]);
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, clueBytes(2, 'Mara', 'first wording'));
    fireEvent.click(screen.getByRole('button', { name: 'Read clue again' }));
    const before = noteEl().innerHTML;

    // Past the 5 second window, so it is handled again, with other clue text.
    fakes.clock.t += 6000;
    hear(fakes, clueBytes(2, 'Mara', 'second wording'));

    expect(noteEl().innerHTML).toBe(before);
    expect(screen.getByTestId('already-note-clue').textContent).toBe('first wording');
  });

  it('a different found Spirit replaces the note and hides the clue', async () => {
    seedFound([
      [2, 'Mara'],
      [4, 'Orrin'],
    ]);
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, clueBytes(2, 'Mara'));
    fireEvent.click(screen.getByRole('button', { name: 'Read clue again' }));
    expect(screen.getByTestId('already-note-clue')).toBeTruthy();

    hear(fakes, clueBytes(4, 'Orrin'));

    expect(noteText()).toBe('Already found \u00b7 Spirit 4 of 5 \u00b7 Orrin');
    expect(screen.queryByTestId('already-note-clue')).toBeNull();
    expect(screen.getByRole('button', { name: 'Read clue again' })).toBeTruthy();
  });
});

describe('Listen: what removes the note', () => {
  async function withNote(): Promise<Fakes> {
    seedFound([[2, 'Mara']]);
    const fakes = makeFakes();
    await start(fakes);
    hear(fakes, clueBytes(2, 'Mara'));
    expect(noteText()).not.toBe('');
    return fakes;
  }

  it('a new clue removes the note, stops capture and navigates', async () => {
    const fakes = await withNote();
    hear(fakes, clueBytes(3, 'Fenn'));
    expect(noteText()).toBe('');
    expect(fakes.stopListening).toHaveBeenCalledTimes(1);
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    expect(fakes.dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: 'huntReceived',
      intake: { kind: 'new' },
    });
  });

  it('a garbled clue removes the note and takes the garbled path', async () => {
    const fakes = await withNote();
    const bad = encode({ type: 'hunt-clue', text: 'not a clue' });
    if (!bad.ok) throw new Error('encode failed');
    hear(fakes, bad.value);
    expect(noteText()).toBe('');
    expect(fakes.dispatch).toHaveBeenCalledWith({ type: 'received', state: { kind: 'garbled' } });
  });

  it('a mic loss removes the note and it stays gone after listening again', async () => {
    const fakes = await withNote();
    act(() => {
      fakes.handlers().onMicLost();
    });
    expect(screen.queryByTestId('already-note')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('listen-retry'));
    });
    expect(noteText()).toBe('');
  });

  it('leaving the screen removes the note', async () => {
    const fakes = await withNote();
    fireEvent.click(screen.getByTestId('listen-back'));
    expect(fakes.stopListening).toHaveBeenCalled();
    cleanup();
    const again = makeFakes();
    await start(again);
    expect(noteText()).toBe('');
  });
});

describe('Listen: Hunt clue repeats and multipart', () => {
  it('ignores a repeat within 5 seconds and handles one after 5 seconds', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const bytes = clueBytes(1, 'Wren');

    hear(fakes, bytes);
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    expect(getProgressStore().load(HUNT)?.found).toEqual([{ index: 1, name: 'Wren' }]);
    setItem.mockClear();

    fakes.clock.t += 4999;
    hear(fakes, bytes);
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    expect(noteText()).toBe('');
    expect(setItem).not.toHaveBeenCalled();

    // The Spirit is saved now, so the handled repeat shows the note and does not navigate.
    fakes.clock.t += 1;
    hear(fakes, bytes);
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    expect(noteText()).toBe('Already found \u00b7 Spirit 1 of 5 \u00b7 Wren');
  });

  it('ignores a multipart hunt-clue: no note, no dispatch, no stop, no write', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const single = clueBytes(1, 'Wren');
    const multipart = single.slice();
    multipart[2] = (multipart[2] as number) | 0x04;
    const probe = await import('@screech/core');
    const decoded = probe.decode(multipart);
    if (!decoded.ok || !decoded.value.multipart) throw new Error('fixture is not multipart');
    setItem.mockClear();

    hear(fakes, multipart);

    expect(fakes.dispatch).not.toHaveBeenCalled();
    expect(fakes.stopListening).not.toHaveBeenCalled();
    expect(noteText()).toBe('');
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
  });
});

describe('Listen: resuming from a queued start (takeListenStart)', () => {
  it('starts listening on mount without a tap and without calling unlockAudio again', async () => {
    const fakes = makeFakes();
    queueListenStart(Promise.resolve(UNLOCK_OK));
    render(createElement(Listen, fakes.props));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fakes.unlockAudio).not.toHaveBeenCalled();
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(fakes.startListening).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
    expect(screen.queryByRole('button', { name: /start listening/i })).toBeNull();
    expect(takeListenStart()).toBeNull();
  });

  it('is one-shot: the next mount shows the Start control and opens no mic', () => {
    const fakes = makeFakes();
    queueListenStart(Promise.resolve(UNLOCK_OK));
    render(createElement(Listen, fakes.props));
    cleanup();
    openMicMock.mockClear();
    render(createElement(Listen, fakes.props));
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
    expect(openMicMock).not.toHaveBeenCalled();
  });

  it('a failed queued unlock shows the audio message with a retry and opens no mic', async () => {
    const fakes = makeFakes();
    queueListenStart(Promise.resolve({ ok: false } as unknown as UnlockOutcome));
    render(createElement(Listen, fakes.props));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toContain(MSG_AUDIO_FAILED);
    expect(openMicMock).not.toHaveBeenCalled();
    expect(fakes.startListening).not.toHaveBeenCalled();
  });

  it('leaving before the queued unlock resolves never starts capture or leaves the mic open', async () => {
    const fakes = makeFakes();
    let release: (o: UnlockOutcome) => void = () => undefined;
    queueListenStart(new Promise<UnlockOutcome>((r) => (release = r)));
    render(createElement(Listen, fakes.props));
    cleanup();
    await act(async () => {
      release(UNLOCK_OK);
      await Promise.resolve();
    });
    expect(openMicMock).not.toHaveBeenCalled();
    expect(fakes.startListening).not.toHaveBeenCalled();
  });
});
