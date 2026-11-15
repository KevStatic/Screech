import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import Awaken from '../../src/ui/screens/Awaken';
import { useFlow } from '../../src/ui/hooks/useFlow';
import { canListen } from '../../src/logic/flow';
import type { Env } from '../../src/logic/capabilities';
import type { UnlockOutcome } from '../../src/audio/session';
import {
  MIC_BLOCKED_MESSAGE,
  MIC_DENIED_MESSAGE,
  openMic,
  stopStream,
  type MicResult,
} from '../../src/audio/mic';

vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn(), stopStream: vi.fn() };
});

const openMicMock = vi.mocked(openMic);
const stopStreamMock = vi.mocked(stopStream);

const GOOD_ENV: Env = {
  hasWasm: true,
  hasWebAudio: true,
  isSecureContext: true,
  hasGetUserMedia: true,
};

const UNLOCK_OK = { ok: true } as unknown as UnlockOutcome;
const UNLOCK_FAIL: UnlockOutcome = { ok: false, reason: 'resume-rejected' };
const DENIED: MicResult = {
  ok: false,
  reason: 'denied',
  message: MIC_DENIED_MESSAGE,
};

const fakeStream = { id: 'fake-stream' } as unknown as MediaStream;
const GRANTED: MicResult = { ok: true, stream: fakeStream };

let unlockAudio: ReturnType<typeof vi.fn<() => Promise<UnlockOutcome>>>;

function Harness({ env }: { env: Env }): ReactElement {
  const flow = useFlow();
  return createElement(
    'div',
    null,
    createElement(Awaken, { flow, audio: { unlockAudio }, env }),
    createElement('output', { 'data-testid': 'screen' }, flow.state.screen),
    createElement('output', { 'data-testid': 'mic' }, flow.state.mic),
    createElement('output', { 'data-testid': 'listen' }, String(canListen(flow.state))),
  );
}

function mount(env: Env = GOOD_ENV): void {
  render(createElement(Harness, { env }));
}

async function tap(name: RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

const text = (id: string): string | null => screen.getByTestId(id).textContent;

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
  unlockAudio = vi.fn(() => Promise.resolve(UNLOCK_OK));
  openMicMock.mockReset();
  stopStreamMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Awaken screen', () => {
  it('granted: stops the stream at once and moves to Speak', async () => {
    openMicMock.mockResolvedValue(GRANTED);
    mount();
    expect(text('screen')).toBe('awaken');
    await tap(/^awaken$/i);
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(stopStreamMock).toHaveBeenCalledWith(fakeStream);
    expect(text('screen')).toBe('speak');
    expect(text('mic')).toBe('granted');
  });

  it('calls unlockAudio synchronously in the tap, before the mic is requested', () => {
    openMicMock.mockResolvedValue(GRANTED);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^awaken$/i }));
    // No awaiting has happened yet: only the synchronous part of the handler ran.
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(openMicMock).not.toHaveBeenCalled();
  });

  it('denied: allows at most 3 mic requests, then only continue and settings help', async () => {
    openMicMock.mockResolvedValue(DENIED);
    mount();

    await tap(/^awaken$/i);
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(text('screen')).toBe('awaken');
    expect(screen.getByText(MIC_DENIED_MESSAGE)).toBeTruthy();
    expect(screen.getAllByText(/browser settings/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^awaken$/i })).toBeNull();

    await tap(/ask for the microphone again \(2 left\)/i);
    expect(openMicMock).toHaveBeenCalledTimes(2);
    await tap(/ask for the microphone again \(1 left\)/i);
    expect(openMicMock).toHaveBeenCalledTimes(3);

    expect(screen.queryByRole('button', { name: /ask for the microphone again/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^awaken$/i })).toBeNull();
    expect(screen.getByText(/too many tries/i)).toBeTruthy();
    expect(screen.getAllByText(/browser settings/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /continue without listening/i })).toBeTruthy();
    expect(openMicMock).toHaveBeenCalledTimes(3);
  });

  it('unlock failure: shows retry and never requests the mic', async () => {
    unlockAudio.mockResolvedValue(UNLOCK_FAIL);
    mount();
    await tap(/^awaken$/i);
    expect(screen.getByText(/audio could not start/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(openMicMock).not.toHaveBeenCalled();
    expect(text('screen')).toBe('awaken');

    // Retry works once unlock succeeds.
    unlockAudio.mockResolvedValue(UNLOCK_OK);
    openMicMock.mockResolvedValue(GRANTED);
    await tap(/try again/i);
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(text('screen')).toBe('speak');
  });

  it('unlock failure repeated: the mic is never requested, even after many retries', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    unlockAudio.mockResolvedValue(UNLOCK_FAIL);
    mount();
    await tap(/^awaken$/i);
    for (let i = 0; i < 5; i++) await tap(/try again/i);
    expect(unlockAudio).toHaveBeenCalledTimes(6);
    expect(openMicMock).toHaveBeenCalledTimes(0);
    expect(getUserMedia).toHaveBeenCalledTimes(0);
    expect(text('screen')).toBe('awaken');
    expect(text('mic')).toBe('unprobed');
  });

  it('blocked: shows the blocked message with only the continue control', async () => {
    openMicMock.mockResolvedValue({ ok: false, reason: 'blocked', message: MIC_BLOCKED_MESSAGE });
    mount();
    await tap(/^awaken$/i);
    expect(openMicMock).toHaveBeenCalledTimes(1);
    expect(text('mic')).toBe('blocked');
    expect(text('screen')).toBe('awaken');
    expect(screen.getByText(MIC_BLOCKED_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^awaken$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /try again|ask for the microphone/i })).toBeNull();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.filter((t) => /continue without listening/i.test(t ?? ''))).toHaveLength(1);

    await tap(/continue without listening/i);
    expect(text('screen')).toBe('speak');
    expect(text('mic')).toBe('skipped');
    expect(text('listen')).toBe('false');
  });

  it('insecure context: explains HTTPS, requests no mic, offers continue', async () => {
    mount({ ...GOOD_ENV, isSecureContext: false });
    await tap(/^awaken$/i);
    expect(screen.getByText(/need https/i)).toBeTruthy();
    expect(openMicMock).not.toHaveBeenCalled();
    expect(text('mic')).toBe('insecure-context');
    expect(screen.queryByRole('button', { name: /^awaken$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /continue without listening/i })).toBeTruthy();
  });

  it('no getUserMedia: explains it, requests no mic, offers continue', async () => {
    mount({ ...GOOD_ENV, hasGetUserMedia: false });
    await tap(/^awaken$/i);
    expect(screen.getByText(/no microphone access/i)).toBeTruthy();
    expect(openMicMock).not.toHaveBeenCalled();
    expect(text('mic')).toBe('no-getusermedia');
    expect(screen.getByRole('button', { name: /continue without listening/i })).toBeTruthy();
  });

  it('continue without listening: moves to Speak with Listen unavailable', async () => {
    openMicMock.mockResolvedValue(DENIED);
    mount();
    await tap(/^awaken$/i);
    await tap(/continue without listening/i);
    expect(text('screen')).toBe('speak');
    expect(text('mic')).toBe('skipped');
    expect(text('listen')).toBe('false');
  });
});
