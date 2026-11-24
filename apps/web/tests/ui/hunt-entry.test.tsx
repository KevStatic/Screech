import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ReactElement } from 'react';
import Awaken from '../../src/ui/screens/Awaken';
import Speak from '../../src/ui/screens/Speak';
import { useFlow, type FlowApi } from '../../src/ui/hooks/useFlow';
import { useDraft } from '../../src/ui/hooks/useDraft';
import { INITIAL_FLOW_STATE, type FlowEvent, type FlowState } from '../../src/logic/flow';
import type { Env } from '../../src/logic/capabilities';
import type { UnlockOutcome } from '../../src/audio/session';
import { openMic } from '../../src/audio/mic';

// Feature: ghost-hunt, entry control (Requirements 3.1)

vi.mock('../../src/audio/mic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/mic')>();
  return { ...actual, openMic: vi.fn(), stopStream: vi.fn() };
});

vi.mock('../../src/audio/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/session')>();
  return {
    ...actual,
    ensureRunning: vi.fn(() => Promise.resolve()),
    isRunning: vi.fn(() => false),
    unlockAudio: vi.fn(),
  };
});

const openMicMock = vi.mocked(openMic);

const GOOD_ENV: Env = {
  hasWasm: true,
  hasWebAudio: true,
  isSecureContext: true,
  hasGetUserMedia: true,
};

const unlockAudio = vi.fn(() => Promise.resolve({ ok: true } as unknown as UnlockOutcome));

function AwakenHarness(): ReactElement {
  const flow = useFlow();
  return createElement(
    'div',
    null,
    createElement(Awaken, { flow, audio: { unlockAudio }, env: GOOD_ENV }),
    createElement('output', { 'data-testid': 'screen' }, flow.state.screen),
    createElement('output', { 'data-testid': 'return' }, String(flow.state.huntReturn)),
    createElement('output', { 'data-testid': 'mic' }, flow.state.mic),
  );
}

function SpeakHarness({ flowState }: { flowState: FlowState }): ReactElement {
  const draft = useDraft();
  const dispatched: FlowEvent[] = dispatchLog;
  const flow: FlowApi = {
    state: flowState,
    dispatch: (event) => {
      dispatched.push(event);
    },
    holdFired: () => undefined,
    wakeTapped: () => undefined,
  };
  return createElement(Speak, {
    flow,
    audio: {
      unlockAudio,
      ensureRunning: () => Promise.resolve(),
      isRunning: () => false,
      context: () => null,
    },
    draft,
    onTransmission: () => undefined,
  });
}

let dispatchLog: FlowEvent[];

const speakState = (over: Partial<FlowState> = {}): FlowState => ({
  ...INITIAL_FLOW_STATE,
  screen: 'speak',
  mic: 'granted',
  ...over,
});

const entry = (): HTMLButtonElement => screen.getByTestId('hunt-entry') as HTMLButtonElement;

function expectTouchTarget(button: HTMLElement): void {
  expect(button.classList.contains('hit')).toBe(true);
  expect(parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
  // The shared .hit rule must itself give 44 px in both directions.
  const tokens = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8');
  const screens = readFileSync(resolve(__dirname, '../../src/styles/screens.css'), 'utf8');
  expect(tokens).toMatch(/--hit:\s*44px/);
  const rule = /\.hit\s*\{([^}]*)\}/.exec(screens)?.[1] ?? '';
  expect(rule).toMatch(/min-width:\s*var\(--hit\)/);
  expect(rule).toMatch(/min-height:\s*var\(--hit\)/);
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
  dispatchLog = [];
  unlockAudio.mockClear();
  openMicMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Ghost Hunt entry control on Awaken', () => {
  it('is a labelled button of at least 44 px', () => {
    render(createElement(AwakenHarness));
    expect(entry().tagName).toBe('BUTTON');
    expect(entry().textContent).toMatch(/ghost hunt/i);
    expectTouchTarget(entry());
  });

  it('opens Hunt setup without asking for the microphone or unlocking audio', async () => {
    render(createElement(AwakenHarness));
    await act(async () => {
      fireEvent.click(entry());
    });
    expect(screen.getByTestId('screen').textContent).toBe('hunt-setup');
    expect(screen.getByTestId('return').textContent).toBe('awaken');
    expect(screen.getByTestId('mic').textContent).toBe(INITIAL_FLOW_STATE.mic);
    expect(openMicMock).not.toHaveBeenCalled();
    expect(unlockAudio).not.toHaveBeenCalled();
  });
});

describe('Ghost Hunt entry control on Speak', () => {
  it('is a labelled button of at least 44 px', () => {
    render(createElement(SpeakHarness, { flowState: speakState() }));
    expect(entry().textContent).toMatch(/ghost hunt/i);
    expectTouchTarget(entry());
  });

  it('dispatches openHuntSetup only, with no mic request or audio unlock', () => {
    render(createElement(SpeakHarness, { flowState: speakState() }));
    expect(entry().disabled).toBe(false);
    fireEvent.click(entry());
    expect(dispatchLog).toEqual([{ type: 'openHuntSetup' }]);
    expect(openMicMock).not.toHaveBeenCalled();
    expect(unlockAudio).not.toHaveBeenCalled();
  });

  it('is disabled while transmitting and does nothing when clicked', () => {
    render(createElement(SpeakHarness, { flowState: speakState({ transmitting: true }) }));
    expect(entry().disabled).toBe(true);
    fireEvent.click(entry());
    expect(dispatchLog.some((e) => e.type === 'openHuntSetup')).toBe(false);
    expect(openMicMock).not.toHaveBeenCalled();
  });
});
