// Feature: ghost-hunt, task 9.9: HuntComplete screen
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ClueFields } from '@screech/core';
import HuntComplete, { startOverText } from '../../src/ui/screens/HuntComplete';
import HuntReveal from '../../src/ui/screens/HuntReveal';
import { INITIAL_FLOW_STATE, type FlowState } from '../../src/logic/flow';
import type { HuntNavIntake } from '../../src/logic/hunt-route';
import type { FoundState } from '../../src/logic/hunt-found';
import { getProgressStore, resetProgressStoreForTests } from '../../src/ui/hooks/progress-store';
import { takeListenStart } from '../../src/ui/hooks/listen-handoff';
import { hauntPlayer } from '../../src/audio/haunt-player';
import { setExorcise } from '../../src/ui/hooks/useMotion';

const FIELDS: ClueFields = {
  huntId: 'ABCDEF',
  index: 3,
  total: 3,
  name: 'Mara',
  clue: 'The end',
};

const DONE: FoundState = {
  huntId: 'ABCDEF',
  total: 3,
  found: [
    { index: 1, name: 'Otto' },
    { index: 2, name: 'Lena' },
    { index: 3, name: 'Mara' },
  ],
  firstFoundAt: 10_000,
  completedAt: 10_000 + 185_000,
};

function flowState(hunt: HuntNavIntake): FlowState {
  return { ...INITIAL_FLOW_STATE, screen: 'hunt-complete', hunt } as unknown as FlowState;
}

const COMPLETE_INTAKE: HuntNavIntake = { kind: 'complete', fields: FIELDS, state: DONE };

function setup(hunt: HuntNavIntake = COMPLETE_INTAKE) {
  const dispatch = vi.fn();
  const unlockAudio = vi.fn(() => Promise.resolve({ ok: true as const } as never));
  render(createElement(HuntComplete, { flow: { state: flowState(hunt), dispatch }, audio: { unlockAudio } }));
  return { dispatch, unlockAudio };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

beforeEach(() => {
  setExorcise(false);
  vi.stubGlobal('localStorage', memoryStorage());
  resetProgressStoreForTests();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  takeListenStart();
  resetProgressStoreForTests();
  setExorcise(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HuntComplete content', () => {
  it('shows the title, M:SS time, Hunt_ID, count and every Spirit name', () => {
    setup();
    expect(screen.getByTestId('hunt-complete-title').textContent).toBe('Hunt complete');
    expect(screen.getByTestId('hunt-complete-time').textContent).toBe('3:05');
    expect(screen.getByTestId('hunt-complete-id').textContent).toBe('Hunt ID: ABCDEF');
    expect(screen.getAllByText('Spirits found: 3 of 3')).toHaveLength(1);
    const items = Array.from(document.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items).toHaveLength(3);
    for (const name of ['Otto', 'Lena', 'Mara']) {
      expect(items.some((t) => t.includes(name))).toBe(true);
    }
  });

  it('shows minutes with no cap and a zero-padded seconds field', () => {
    setup({
      kind: 'complete',
      fields: FIELDS,
      state: { ...DONE, firstFoundAt: 0, completedAt: 3_605_000 },
    });
    expect(screen.getByTestId('hunt-complete-time').textContent).toBe('60:05');
  });

  it('plays no Haunting Sound', () => {
    const play = vi.spyOn(hauntPlayer, 'play');
    setup();
    fireEvent.click(screen.getByTestId('hunt-complete-start-over'));
    expect(play).not.toHaveBeenCalled();
  });

  it('is shown directly for a saved completed Hunt, with no spelling', () => {
    setup();
    expect(screen.queryByTestId('ouija-board')).toBeNull();
    expect(screen.queryByTestId('hunt-reveal-skip')).toBeNull();
  });

  it('a completed Hunt also leaves HuntReveal free to hand over once spelling ends', () => {
    // Complements the Reveal tests: HuntComplete is the screen that follows after the last reveal.
    const dispatch = vi.fn();
    const state: FoundState = DONE;
    const hunt: HuntNavIntake = {
      kind: 'new',
      fields: FIELDS,
      before: { ...state, found: state.found.slice(0, 2), completedAt: null },
      state,
      persisted: true,
    };
    render(
      createElement(HuntReveal, {
        flow: { state: { ...flowState(hunt), screen: 'hunt-reveal' }, dispatch },
        unlockAudio: () => Promise.resolve({ ok: true as const } as never),
      }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntRevealDone' });
  });
});

describe('HuntComplete controls', () => {
  it('Return to Speak dispatches huntBack and leaves the saved state alone', () => {
    getProgressStore().save(DONE);
    const { dispatch } = setup();
    fireEvent.click(screen.getByTestId('hunt-complete-speak'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntBack', target: 'speak' });
    expect(getProgressStore().load('ABCDEF')).toEqual(DONE);
  });

  it('Start over asks first, naming the Hunt_ID and the number of Spirits', () => {
    const { dispatch } = setup();
    expect(screen.queryByTestId('hunt-complete-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('hunt-complete-start-over'));
    expect(screen.getByTestId('hunt-complete-confirm-text').textContent).toBe(startOverText('ABCDEF', 3));
    expect(screen.getByTestId('hunt-complete-confirm-text').textContent).toContain('Hunt ABCDEF');
    expect(screen.getByTestId('hunt-complete-confirm-text').textContent).toContain('3 found Spirits');
    expect(screen.queryByTestId('hunt-complete-start-over')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('declining keeps the screen and the saved state', () => {
    getProgressStore().save(DONE);
    const { dispatch, unlockAudio } = setup();
    fireEvent.click(screen.getByTestId('hunt-complete-start-over'));
    fireEvent.click(screen.getByTestId('hunt-complete-decline'));
    expect(screen.queryByTestId('hunt-complete-confirm')).toBeNull();
    expect(screen.getByTestId('hunt-complete-start-over')).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(getProgressStore().load('ABCDEF')).toEqual(DONE);
  });

  it('confirming unlocks audio, clears the saved Hunt, queues Listen and dispatches huntRestart', async () => {
    getProgressStore().save(DONE);
    const { dispatch, unlockAudio } = setup();
    fireEvent.click(screen.getByTestId('hunt-complete-start-over'));
    fireEvent.click(screen.getByTestId('hunt-complete-confirm'));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(getProgressStore().load('ABCDEF')).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntRestart' });
    await expect(takeListenStart()).resolves.toBeTruthy();
  });
});
