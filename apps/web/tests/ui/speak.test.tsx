import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useEffect, type ReactElement } from 'react';
import Speak, { MSG_CONTACT_TOO_HEAVY_HINT, MSG_NOTHING_WRITTEN, MSG_SEAL_LATER } from '../../src/ui/screens/Speak';
import { useFlow } from '../../src/ui/hooks/useFlow';
import { useDraft } from '../../src/ui/hooks/useDraft';
import { HOLD_DURATION_MS } from '../../src/logic/hold-machine';
import type { FlowApi } from '../../src/ui/hooks/useFlow';
import type { DraftApi } from '../../src/ui/hooks/useDraft';
import type { UnlockOutcome } from '../../src/audio/session';
import * as session from '../../src/audio/session';

// useHold calls ensureRunning/isRunning straight from the session module.
vi.mock('../../src/audio/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/session')>();
  return {
    ...actual,
    ensureRunning: vi.fn(() => Promise.resolve()),
    isRunning: vi.fn(() => false),
    unlockAudio: vi.fn(),
  };
});

const sessionEnsure = vi.mocked(session.ensureRunning);
const sessionIsRunning = vi.mocked(session.isRunning);
const sessionUnlock = vi.mocked(session.unlockAudio);

const UNLOCK_OK = { ok: true } as unknown as UnlockOutcome;

/** Every ensureRunning, unlock, dispatch and draft update, in call order. */
let log: string[];
let ensureRunning: ReturnType<typeof vi.fn<() => Promise<void>>>;
let unlockAudio: ReturnType<typeof vi.fn<() => Promise<UnlockOutcome>>>;
let flowRef: FlowApi;
let draftRef: DraftApi;

function Harness({ granted = true }: { granted?: boolean }): ReactElement {
  const flow = useFlow();
  const draft = useDraft();
  flowRef = flow;
  draftRef = draft;
  useEffect(() => {
    if (granted) flow.dispatch({ type: 'micResult', status: 'granted' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const loggedFlow: FlowApi = {
    ...flow,
    dispatch: (event) => {
      log.push(`dispatch:${event.type}`);
      flow.dispatch(event);
    },
  };
  const loggedDraft: DraftApi = {
    draft: draft.draft,
    update: (change) => {
      log.push('update');
      draft.update(change);
    },
  };
  return createElement(
    'div',
    null,
    createElement(Speak, {
      flow: loggedFlow,
      audio: { unlockAudio, ensureRunning, isRunning: () => false, context: () => null },
      draft: loggedDraft,
      onTransmission: () => undefined,
    }),
    createElement('output', { 'data-testid': 'screen' }, flow.state.screen),
  );
}

function mount(granted = true): void {
  render(createElement(Harness, { granted }));
}

const card = (name: RegExp): HTMLElement => screen.getByRole('button', { name });
const screechKey = (): HTMLElement => screen.getByRole('button', { name: /screech/i });
const listenButton = (): HTMLElement => screen.getByRole('button', { name: /^listen$/i });
const sealToggle = (): HTMLElement => screen.getByRole('button', { name: /seal this message/i });
const field = (label: RegExp): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;

function write(label: RegExp, value: string): void {
  fireEvent.change(field(label), { target: { value } });
}

beforeEach(() => {
  // jsdom has no PointerEvent. Without it the event loses its `button` field.
  if (typeof window.PointerEvent === 'undefined') {
    Object.defineProperty(window, 'PointerEvent', { configurable: true, writable: true, value: MouseEvent });
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  log = [];
  ensureRunning = vi.fn(() => {
    log.push('ensure');
    return Promise.resolve();
  });
  unlockAudio = vi.fn(() => {
    log.push('unlock');
    return Promise.resolve(UNLOCK_OK);
  });
  sessionEnsure.mockClear();
  sessionIsRunning.mockReset();
  sessionIsRunning.mockReturnValue(false);
  sessionUnlock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Speak: cards and fields', () => {
  it('starts with Whisper pressed and the others not', () => {
    mount();
    expect(card(/whisper/i).getAttribute('aria-pressed')).toBe('true');
    for (const name of [/portal/i, /ether/i, /summon/i]) {
      expect(card(name).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('selecting a card presses it alone and shows its fields', () => {
    mount();
    fireEvent.click(card(/ether/i));
    expect(card(/ether/i).getAttribute('aria-pressed')).toBe('true');
    expect(card(/whisper/i).getAttribute('aria-pressed')).toBe('false');
    expect(field(/network name/i)).toBeTruthy();
    expect(field(/password/i)).toBeTruthy();
    expect(screen.queryByLabelText(/your whisper/i)).toBeNull();
    fireEvent.click(card(/summon/i));
    expect(field(/^name$/i)).toBeTruthy();
    expect(field(/phone/i)).toBeTruthy();
    expect(field(/email/i)).toBeTruthy();
  });

  it('keeps what was typed in every card when switching between cards', () => {
    mount();
    write(/your whisper/i, 'hello');
    fireEvent.click(card(/portal/i));
    write(/portal address/i, 'https://example.com');
    fireEvent.click(card(/ether/i));
    write(/network name/i, 'Haunted');
    write(/^password/i, 'secret123');
    fireEvent.click(card(/summon/i));
    write(/^name$/i, 'Ada');
    fireEvent.click(card(/whisper/i));
    expect(field(/your whisper/i).value).toBe('hello');
    fireEvent.click(card(/portal/i));
    expect(field(/portal address/i).value).toBe('https://example.com');
    fireEvent.click(card(/ether/i));
    expect(field(/network name/i).value).toBe('Haunted');
    expect(field(/^password/i).value).toBe('secret123');
    fireEvent.click(card(/summon/i));
    expect(field(/^name$/i).value).toBe('Ada');
  });
});

describe('Speak: SCREECH key states', () => {
  it('is disabled with a plain reason while nothing is written', () => {
    mount();
    expect((screechKey() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(MSG_NOTHING_WRITTEN)).toBeTruthy();
  });

  it('becomes enabled once a fitting message is written, and disabled again when cleared', () => {
    mount();
    write(/your whisper/i, 'hi');
    expect((screechKey() as HTMLButtonElement).disabled).toBe(false);
    write(/your whisper/i, '');
    expect((screechKey() as HTMLButtonElement).disabled).toBe(true);
  });

  it('over budget: shows the too-heavy message and keeps the key disabled', () => {
    mount();
    write(/your whisper/i, 'a'.repeat(300));
    expect(screen.getByRole('alert').textContent).toMatch(/Too heavy to cross over \(\d+\/140 bytes\)/);
    expect(screen.getByTestId('candle-count').textContent).toMatch(/\/140 bytes/);
    expect((screechKey() as HTMLButtonElement).disabled).toBe(true);
  });

  it('too heavy for a contact: suggests removing the phone or shortening the name', () => {
    mount();
    fireEvent.click(card(/summon/i));
    write(/^name$/i, 'N'.repeat(100));
    write(/^phone$/i, '5'.repeat(30));
    write(/^email$/i, 'e'.repeat(30) + '@example.com');
    expect(screen.getByTestId('contact-heavy-hint').textContent).toBe(MSG_CONTACT_TOO_HEAVY_HINT);
    expect((screechKey() as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows no contact hint when the contact fits, or for other types when too heavy', () => {
    mount();
    fireEvent.click(card(/summon/i));
    write(/^name$/i, 'Ada');
    expect(screen.queryByTestId('contact-heavy-hint')).toBeNull();
    fireEvent.click(card(/whisper/i));
    write(/your whisper/i, 'a'.repeat(300));
    expect(screen.queryByTestId('contact-heavy-hint')).toBeNull();
  });
  it('labels the Wi-Fi security options Open, WPA and WEP', () => {
    mount();
    fireEvent.click(card(/ether/i));
    const labels = [...(field(/security/i) as unknown as HTMLSelectElement).options].map((o) => o.textContent);
    expect(labels).toEqual(['Open', 'WPA', 'WEP']);
  });
  it('is disabled while listening is not possible to combine with sending', () => {
    mount();
    write(/your whisper/i, 'hi');
    act(() => {
      flowRef.dispatch({ type: 'openListen' });
    });
    expect(screen.getByTestId('screen').textContent).toBe('listen');
    expect((screechKey() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Speak: hold gesture', () => {
  function useFakeClock(): void {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  }

  it('pointer hold for the full duration fires once and asks to wake a sleeping context', () => {
    useFakeClock();
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.pointerDown(screechKey(), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 100);
    });
    expect(flowRef.state.wakePending).toBe(true);
    expect(screen.getByTestId('wake-control')).toBeTruthy();
  });

  it('pointer release before the duration does not fire', () => {
    useFakeClock();
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.pointerDown(screechKey(), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS - 100);
    });
    fireEvent.pointerUp(screechKey(), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2);
    });
    expect(flowRef.state.wakePending).toBe(false);
    expect(screechKey().getAttribute('data-progress')).toBe('0');
  });

  it('pointer leave cancels the hold', () => {
    useFakeClock();
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.pointerDown(screechKey(), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS - 100);
    });
    expect(Number(screechKey().getAttribute('data-progress'))).toBeGreaterThan(0);
    fireEvent.pointerLeave(screechKey());
    expect(screechKey().getAttribute('data-progress')).toBe('0');
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2);
    });
    expect(flowRef.state.wakePending).toBe(false);
  });

  it('keyboard hold with auto-repeat fires once; repeats do not restart the hold', () => {
    useFakeClock();
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.keyDown(screechKey(), { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const before = sessionEnsure.mock.calls.length;
    fireEvent.keyDown(screechKey(), { key: ' ', repeat: true });
    fireEvent.keyDown(screechKey(), { key: ' ', repeat: true });
    expect(sessionEnsure.mock.calls.length).toBe(before);
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS);
    });
    expect(flowRef.state.wakePending).toBe(true);
  });

  it('keyboard release before the duration does not fire', () => {
    useFakeClock();
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.keyDown(screechKey(), { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.keyUp(screechKey(), { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2);
    });
    expect(flowRef.state.wakePending).toBe(false);
  });

  it('a disabled key never starts a hold', () => {
    useFakeClock();
    mount();
    fireEvent.pointerDown(screechKey(), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2);
    });
    expect(flowRef.state.wakePending).toBe(false);
  });

  it('the hold timer never calls resume() or unlockAudio(), even when it fires', () => {
    useFakeClock();
    const resume = vi.fn(() => Promise.resolve());
    mount();
    write(/your whisper/i, 'hi');
    fireEvent.pointerDown(screechKey(), { button: 0 });
    const ensureAtPress = sessionEnsure.mock.calls.length;
    const appEnsureAtPress = ensureRunning.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 200);
    });
    expect(flowRef.state.wakePending).toBe(true);
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(sessionUnlock).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    // The timer is not a gesture, so it does not even keep the context alive.
    expect(sessionEnsure.mock.calls.length).toBe(ensureAtPress);
    expect(ensureRunning.mock.calls.length).toBe(appEnsureAtPress);
  });
});

describe('Speak: seal toggle', () => {
  it('is disabled for assistive tech, stays unpressed, and explains why', () => {
    mount();
    expect(sealToggle().getAttribute('aria-disabled')).toBe('true');
    expect(sealToggle().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(MSG_SEAL_LATER)).toBeTruthy();
    fireEvent.click(sealToggle());
    expect(sealToggle().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Speak: gestures keep the audio context alive first', () => {
  it('clicking a card calls ensureRunning() before anything else', () => {
    mount();
    log = [];
    fireEvent.click(card(/portal/i));
    expect(log[0]).toBe('ensure');
    expect(log).toContain('update');
    expect(ensureRunning).toHaveBeenCalledTimes(1);
  });

  it('a keydown on a card calls ensureRunning()', () => {
    mount();
    log = [];
    fireEvent.keyDown(card(/ether/i), { key: 'Enter' });
    expect(log[0]).toBe('ensure');
    expect(ensureRunning).toHaveBeenCalledTimes(1);
  });

  it('clicking and typing in the text input call ensureRunning() before the edit', () => {
    mount();
    log = [];
    fireEvent.click(field(/your whisper/i));
    expect(log).toEqual(['ensure']);
    fireEvent.keyDown(field(/your whisper/i), { key: 'a' });
    expect(log).toEqual(['ensure', 'ensure']);
  });

  it('inputs of every card call ensureRunning() on click and keydown', () => {
    mount();
    const cases: Array<[RegExp, RegExp]> = [
      [/portal/i, /portal address/i],
      [/ether/i, /network name/i],
      [/ether/i, /^password/i],
      [/ether/i, /security/i],
      [/summon/i, /^name$/i],
      [/summon/i, /phone/i],
      [/summon/i, /email/i],
    ];
    for (const [cardName, label] of cases) {
      fireEvent.click(card(cardName));
      ensureRunning.mockClear();
      fireEvent.click(field(label));
      fireEvent.keyDown(field(label), { key: 'a' });
      expect(ensureRunning).toHaveBeenCalledTimes(2);
    }
  });

  it('the seal toggle calls ensureRunning() on click and keydown', () => {
    mount();
    log = [];
    fireEvent.click(sealToggle());
    fireEvent.keyDown(sealToggle(), { key: 'Enter' });
    expect(log).toEqual(['ensure', 'ensure']);
  });

  it('Listen calls ensureRunning() first, then unlocks, then opens the listen screen', async () => {
    mount();
    log = [];
    await act(async () => {
      fireEvent.click(listenButton());
    });
    expect(log.slice(0, 3)).toEqual(['ensure', 'unlock', 'dispatch:openListen']);
    expect(screen.getByTestId('screen').textContent).toBe('listen');
  });

  it('a keydown on Listen calls ensureRunning()', () => {
    mount();
    log = [];
    fireEvent.keyDown(listenButton(), { key: 'Enter' });
    expect(log).toEqual(['ensure']);
  });

  it('Listen is disabled without the microphone and says why', () => {
    mount(false);
    expect((listenButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/listening is off/i)).toBeTruthy();
  });
});
