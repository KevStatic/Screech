import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { encode } from '@screech/core';
import Listen, {
  LABEL_LISTENING,
  LABEL_RETRY,
  MSG_MIC_SILENT,
  resetListenDedupe,
  type ListenProps,
} from '../../src/ui/screens/Listen';
import { INITIAL_FLOW_STATE, NOTICE_SEND_BLOCKED } from '../../src/logic/flow';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import type { CaptureHandle, CaptureHandlers } from '../../src/audio/capture';
import type { UnlockOutcome } from '../../src/audio/session';
import { MIC_DENIED_MESSAGE, openMic, type MicResult } from '../../src/audio/mic';

vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn() };
});

const openMicMock = vi.mocked(openMic);

const UNLOCK_OK = { ok: true, sampleRate: 44100 } as unknown as UnlockOutcome;

interface Fakes {
  readonly props: ListenProps;
  readonly dispatch: ReturnType<typeof vi.fn>;
  readonly track: { stop: ReturnType<typeof vi.fn> };
  readonly unlockAudio: ReturnType<typeof vi.fn>;
  readonly startListening: ReturnType<typeof vi.fn>;
  readonly stopListening: ReturnType<typeof vi.fn>;
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
  // Like the real session: stopping capture stops the mic tracks.
  const stopListening = vi.fn(() => {
    if (captured !== null) track.stop();
  });

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
    track,
    unlockAudio,
    startListening,
    stopListening,
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
  resetListenDedupe();
  setExorcise(false);
});

afterEach(() => {
  cleanup();
  setExorcise(false);
});

describe('Listen screen', () => {
  it('ready phase: shows the start control and band, opens no mic and does not capture', () => {
    const fakes = makeFakes();
    render(createElement(Listen, fakes.props));
    expect(screen.getByRole('button', { name: /start listening/i })).toBeTruthy();
    expect(screen.getByTestId('listen-band').textContent).toContain('1.9 kHz to 6.4 kHz');
    expect(screen.getByTestId('listen-send-notice').textContent).toBe(NOTICE_SEND_BLOCKED);
    expect(screen.queryByTestId('listen-label')).toBeNull();
    expect(openMicMock).not.toHaveBeenCalled();
    expect(fakes.unlockAudio).not.toHaveBeenCalled();
    expect(fakes.startListening).not.toHaveBeenCalled();
  });

  it('tapping Start listening unlocks audio first, opens the mic, then shows Listening', async () => {
    const fakes = makeFakes();
    render(createElement(Listen, fakes.props));
    fireEvent.click(screen.getByRole('button', { name: /start listening/i }));
    // Only the synchronous part of the handler has run.
    expect(fakes.unlockAudio).toHaveBeenCalledTimes(1);
    expect(openMicMock).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(fakes.startListening).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
    expect(screen.queryByRole('button', { name: /start listening/i })).toBeNull();
    expect(screen.getByTestId('spectrogram')).toBeTruthy();
    expect(screen.getByTestId('kii-meter')).toBeTruthy();
  });

  it('mic lost: shows the silent message and retry; retry listens again', async () => {
    const fakes = makeFakes();
    await start(fakes);
    act(() => {
      fakes.handlers().onMicLost();
    });
    expect(fakes.stopListening).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(MSG_MIC_SILENT);
    expect(screen.queryByTestId('listen-label')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: LABEL_RETRY }));
    });
    expect(fakes.unlockAudio).toHaveBeenCalledTimes(2);
    expect(fakes.startListening).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
  });

  it('mic refused: shows the refusal message with a retry control', async () => {
    const fakes = makeFakes();
    openMicMock.mockResolvedValue({ ok: false, reason: 'denied', message: MIC_DENIED_MESSAGE });
    await start(fakes);
    expect(screen.getByRole('alert').textContent).toContain(MIC_DENIED_MESSAGE);
    expect(screen.getByRole('button', { name: LABEL_RETRY })).toBeTruthy();
    expect(fakes.startListening).not.toHaveBeenCalled();
  });

  it('Back stops the mic tracks and leaves the screen', async () => {
    const fakes = makeFakes();
    await start(fakes);
    expect(fakes.track.stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('listen-back'));
    expect(fakes.stopListening).toHaveBeenCalled();
    expect(fakes.track.stop).toHaveBeenCalled();
    expect(fakes.dispatch).toHaveBeenCalledWith({ type: 'leaveListen' });
  });

  it('an ignore packet changes nothing: no dispatch, no stop, still Listening', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const before = document.body.innerHTML;
    act(() => {
      fakes.handlers().onPacketBytes(new Uint8Array([0x00, 0x01, 0x02]));
    });
    expect(fakes.dispatch).not.toHaveBeenCalled();
    expect(fakes.stopListening).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    expect(screen.getByTestId('listen-label').textContent).toBe(LABEL_LISTENING);
  });

  it('a valid packet stops capture and dispatches a reveal once; a repeat is dropped', async () => {
    const fakes = makeFakes();
    await start(fakes);
    const encoded = encode({ type: 'text', text: 'hi' });
    if (!encoded.ok) throw new Error('encode failed');
    act(() => {
      fakes.handlers().onPacketBytes(encoded.value);
    });
    expect(fakes.stopListening).toHaveBeenCalledTimes(1);
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
    expect(fakes.dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: 'received',
      state: { kind: 'reveal' },
    });
    act(() => {
      fakes.handlers().onPacketBytes(encoded.value);
    });
    expect(fakes.dispatch).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: the meter is text and the LEDs are gone', async () => {
    setExorcise(true);
    const fakes = makeFakes();
    await start(fakes);
    expect(screen.getByTestId('kii-text').textContent).toBe('[.....] 0 of 5');
    expect(screen.queryByTestId('kii-leds')).toBeNull();
  });

  it('full motion: the meter shows LEDs, not text', async () => {
    const fakes = makeFakes();
    await start(fakes);
    expect(screen.getByTestId('kii-leds')).toBeTruthy();
    expect(screen.queryByTestId('kii-text')).toBeNull();
  });
});
