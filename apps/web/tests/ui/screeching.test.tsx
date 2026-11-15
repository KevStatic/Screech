import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useEffect, type ReactElement } from 'react';
import Screeching, {
  LABEL_CANCEL,
  LABEL_RETURN,
  MSG_CROSSED_OVER,
  MSG_NOT_LEFT,
  MSG_TRAVELLING,
} from '../../src/ui/screens/Screeching';
import type { TransmissionOutcome } from '../../src/ui/screens/Speak';
import type { PlaybackHandle, PlaybackResult } from '../../src/audio/transmit';
import { useFlow } from '../../src/ui/hooks/useFlow';
import { useDraft } from '../../src/ui/hooks/useDraft';
import { setExorcise } from '../../src/ui/hooks/useMotion';

const DURATION = 10;

interface FakeHandle extends PlaybackHandle {
  clock: { now: number };
  stop: ReturnType<typeof vi.fn<() => void>>;
  settle: (result: PlaybackResult) => Promise<void>;
}

function fakeHandle(durationSec = DURATION): FakeHandle {
  const clock = { now: 0 };
  let resolve: (r: PlaybackResult) => void = () => undefined;
  const finished = new Promise<PlaybackResult>((r) => {
    resolve = r;
  });
  return {
    durationSec,
    clock,
    elapsedSec: () => clock.now,
    stop: vi.fn<() => void>(),
    finished,
    settle: async (result) => {
      await act(async () => {
        resolve(result);
        await finished;
      });
    },
  };
}

const outcomeFor = (handle: PlaybackHandle): TransmissionOutcome => ({
  ok: true,
  handle,
  sampleRate: 48000,
  wave: new Float32Array(480000),
});

/** Real flow and draft, so cancel and return can be checked end to end. */
function Harness({ outcome }: { outcome: TransmissionOutcome }): ReactElement {
  const flow = useFlow();
  const draft = useDraft();
  useEffect(() => {
    draft.update((d) => ({ ...d, text: 'hello spirits' }));
    flow.dispatch({ type: 'micResult', status: 'granted' });
    flow.dispatch({ type: 'startTransmit' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createElement(
    'div',
    null,
    flow.state.screen === 'screeching'
      ? createElement(Screeching, { flow, outcome })
      : createElement('p', { 'data-testid': 'speak-marker' }, 'speak'),
    createElement('output', { 'data-testid': 'draft' }, draft.draft.text),
    createElement('output', { 'data-testid': 'screen' }, flow.state.screen),
  );
}

function mountDirect(outcome: TransmissionOutcome, dispatch = vi.fn()): ReturnType<typeof vi.fn> {
  render(createElement(Screeching, { flow: { dispatch }, outcome }));
  return dispatch;
}

const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

beforeEach(() => {
  // jsdom has no canvas. The oscilloscope only needs a context that accepts calls.
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ctx,
  });
  vi.useFakeTimers();
  setExorcise(false);
});

afterEach(() => {
  cleanup();
  setExorcise(false);
  vi.useRealTimers();
});

describe('Screeching: progress', () => {
  it('shows percent, duration and remaining seconds from the playback clock', () => {
    const handle = fakeHandle();
    mountDirect(outcomeFor(handle));
    expect(text('screeching-percent')).toBe('0%');
    expect(text('screeching-duration')).toBe('10.0 s total');
    expect(text('screeching-remaining')).toBe('10 s left');
    expect(screen.getByTestId('screeching-travelling').textContent).toBe(MSG_TRAVELLING);

    handle.clock.now = 2.5;
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(text('screeching-percent')).toBe('25%');
    expect(text('screeching-remaining')).toBe('8 s left');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');

    handle.clock.now = 9.2;
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(text('screeching-percent')).toBe('92%');
    expect(text('screeching-remaining')).toBe('1 s left');
  });

  it('under reduced motion the text changes only once per second', () => {
    setExorcise(true);
    const handle = fakeHandle();
    mountDirect(outcomeFor(handle));
    handle.clock.now = 3;
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(text('screeching-percent')).toBe('0%');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(text('screeching-percent')).toBe('30%');
    expect(text('screeching-remaining')).toBe('7 s left');
    handle.clock.now = 4;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(text('screeching-percent')).toBe('30%');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(text('screeching-percent')).toBe('40%');
  });
});

describe('Screeching: cancel', () => {
  it('stops playback, dispatches transmitEnded and offers no completion message', () => {
    const handle = fakeHandle();
    const dispatch = mountDirect(outcomeFor(handle));
    fireEvent.click(screen.getByRole('button', { name: LABEL_CANCEL }));
    expect(handle.stop).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'transmitEnded' });
  });

  it('returns to Speak with the draft kept', () => {
    const handle = fakeHandle();
    render(createElement(Harness, { outcome: outcomeFor(handle) }));
    expect(text('screen')).toBe('screeching');
    fireEvent.click(screen.getByRole('button', { name: LABEL_CANCEL }));
    expect(handle.stop).toHaveBeenCalledTimes(1);
    expect(text('screen')).toBe('speak');
    expect(screen.getByTestId('speak-marker')).toBeTruthy();
    expect(text('draft')).toBe('hello spirits');
  });

  it('ignores a second tap on cancel', () => {
    const handle = fakeHandle();
    const dispatch = mountDirect(outcomeFor(handle));
    const button = screen.getByRole('button', { name: LABEL_CANCEL });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(handle.stop).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('Screeching: completion', () => {
  it('shows 100%, the crossed-over message and a return control when playback ends', async () => {
    const handle = fakeHandle();
    const dispatch = mountDirect(outcomeFor(handle));
    handle.clock.now = 4;
    await handle.settle('ended');
    expect(text('screeching-percent')).toBe('100%');
    expect(text('screeching-remaining')).toBe('0 s left');
    expect(screen.getByTestId('screeching-done').textContent).toBe(MSG_CROSSED_OVER);
    expect(screen.queryByRole('button', { name: LABEL_CANCEL })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: LABEL_RETURN }));
    expect(handle.stop).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'transmitEnded' });
  });

  it('keeps the draft when returning after completion', async () => {
    const handle = fakeHandle();
    render(createElement(Harness, { outcome: outcomeFor(handle) }));
    await handle.settle('ended');
    fireEvent.click(screen.getByRole('button', { name: LABEL_RETURN }));
    expect(text('screen')).toBe('speak');
    expect(text('draft')).toBe('hello spirits');
  });
});

describe('Screeching: failure', () => {
  it('shows the failure message and a return control when playback fails', async () => {
    const handle = fakeHandle();
    const dispatch = mountDirect(outcomeFor(handle));
    await handle.settle('failed');
    expect(screen.getByTestId('screeching-failed').textContent).toBe(MSG_NOT_LEFT);
    expect(MSG_NOT_LEFT).toBe('The sound did not leave the speaker.');
    expect(screen.queryByTestId('screeching-percent')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: LABEL_RETURN }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'transmitEnded' });
  });

  it('shows the error state with the engine detail when the engine failed to start', () => {
    const dispatch = mountDirect({ ok: false, message: 'The speaker would not open.' });
    expect(screen.getByTestId('screeching-failed').textContent).toBe(MSG_NOT_LEFT);
    expect(screen.getByText('The speaker would not open.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: LABEL_RETURN }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'transmitEnded' });
  });

  it('keeps the draft when returning after an engine failure', () => {
    render(createElement(Harness, { outcome: { ok: false, message: 'No sound device.' } }));
    fireEvent.click(screen.getByRole('button', { name: LABEL_RETURN }));
    expect(text('screen')).toBe('speak');
    expect(text('draft')).toBe('hello spirits');
  });
});
