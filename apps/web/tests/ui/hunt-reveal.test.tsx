// Feature: ghost-hunt, task 9.9: HuntReveal screen
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ClueFields } from '@screech/core';
import HuntReveal, {
  FOLLOW_LINE,
  NOTE_CLEAR_FAILED,
  NOTE_CLEARED,
  NOTE_NOT_SAVED,
} from '../../src/ui/screens/HuntReveal';
import { INITIAL_FLOW_STATE, type FlowState } from '../../src/logic/flow';
import type { HuntIntake } from '../../src/logic/hunt-route';
import type { FoundState } from '../../src/logic/hunt-found';
import type { ProgressStore } from '../../src/logic/hunt-progress';
import { takeListenStart } from '../../src/ui/hooks/listen-handoff';
import { hauntPlayer } from '../../src/audio/haunt-player';
import { setExorcise } from '../../src/ui/hooks/useMotion';

const FIELDS: ClueFields = {
  huntId: 'ABCDEF',
  index: 2,
  total: 5,
  name: 'Mara',
  clue: 'Look under the stairs',
};

function foundState(completedAt: number | null = null): FoundState {
  return {
    huntId: 'ABCDEF',
    total: 5,
    found: [{ index: 2, name: 'Mara' }],
    firstFoundAt: 1000,
    completedAt,
  };
}

type NewIntake = Extract<HuntIntake, { kind: 'new' }>;

function intake(opts: { fields?: ClueFields; persisted?: boolean; completedAt?: number | null } = {}): NewIntake {
  const state = foundState(opts.completedAt ?? null);
  return {
    kind: 'new',
    fields: opts.fields ?? FIELDS,
    before: { ...state, found: [], firstFoundAt: null, completedAt: null },
    state,
    persisted: opts.persisted ?? true,
  };
}

function flowState(hunt: NewIntake): FlowState {
  return { ...INITIAL_FLOW_STATE, screen: 'hunt-reveal', hunt } as unknown as FlowState;
}

function fakeStore(clear: ProgressStore['clear']): { store: ProgressStore; clear: ReturnType<typeof vi.fn> } {
  const clearFn = vi.fn(clear);
  return {
    clear: clearFn,
    store: {
      load: () => null,
      save: () => ({ persisted: true }),
      clear: clearFn as unknown as ProgressStore['clear'],
    },
  };
}

function setup(hunt: NewIntake = intake(), clear: ProgressStore['clear'] = () => ({ cleared: true })) {
  const dispatch = vi.fn();
  const unlockAudio = vi.fn(() => Promise.resolve({ ok: true as const } as never));
  const fake = fakeStore(clear);
  render(
    createElement(HuntReveal, {
      flow: { state: flowState(hunt), dispatch },
      store: fake.store,
      unlockAudio,
    }),
  );
  return { dispatch, unlockAudio, clear: fake.clear };
}

const spelled = (): string => screen.getByTestId('ouija-spelled').textContent ?? '';

let playSpy: ReturnType<typeof vi.spyOn>;
let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setExorcise(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
  playSpy = vi.spyOn(hauntPlayer, 'play');
  openSpy = vi.fn();
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  cleanup();
  takeListenStart();
  setExorcise(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HuntReveal spelling', () => {
  it('shows the name and "Spirit N of M" before spelling, with no counter yet', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mara');
    expect(screen.getByTestId('hunt-reveal-position').textContent).toBe('Spirit 2 of 5');
    expect(screen.getByTestId('hunt-reveal-full-text').textContent).toBe(FIELDS.clue);
    expect(spelled()).toBe('');
    expect(screen.queryByText(/Spirits found:/)).toBeNull();
    expect(screen.queryByTestId('hunt-follow-line')).toBeNull();
  });

  it('shows the counter and the Follow_Line after the spelling ends', () => {
    const { dispatch } = setup();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(spelled()).not.toBe(FIELDS.clue);
    expect(screen.queryByText(/Spirits found:/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(spelled()).toBe(FIELDS.clue);
    expect(screen.getByText('Spirits found: 1 of 5')).toBeTruthy();
    expect(screen.getByTestId('hunt-follow-line').textContent).toBe(FOLLOW_LINE);
    expect(screen.queryByTestId('hunt-reveal-skip')).toBeNull();
    // The Hunt is not complete, so no automatic move to the finish screen.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows the counter at once on skip', () => {
    setup();
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(spelled()).toBe(FIELDS.clue);
    expect(screen.getByText('Spirits found: 1 of 5')).toBeTruthy();
    expect(screen.getByTestId('hunt-follow-line')).toBeTruthy();
  });

  it('dispatches huntRevealDone once, after spelling, when the Hunt is complete', () => {
    const { dispatch } = setup(intake({ completedAt: 9000 }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntRevealDone' });
  });

  it('renders a link in the clue as plain text and opens nothing', () => {
    const clue = 'Go to https://example.com/x now';
    setup(intake({ fields: { ...FIELDS, clue } }));
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(screen.getByTestId('hunt-reveal-full-text').textContent).toBe(clue);
    expect(spelled()).toBe(clue);
    expect(document.querySelector('a')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('renders markup in the name as text', () => {
    setup(intake({ fields: { ...FIELDS, name: '<b>Bold</b>' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('<b>Bold</b>');
    expect(document.querySelector('h1 b')).toBeNull();
  });

  it('plays no Haunting Sound', () => {
    setup();
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(playSpy).not.toHaveBeenCalled();
  });
});

describe('HuntReveal navigation', () => {
  it('Back to Listen calls unlockAudio first, queues the start and dispatches huntBack', async () => {
    const { dispatch, unlockAudio } = setup();
    fireEvent.click(screen.getByTestId('hunt-reveal-back-listen'));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntBack', target: 'listen' });
    const queued = takeListenStart();
    expect(queued).not.toBeNull();
    await expect(queued).resolves.toBeTruthy();
    expect(takeListenStart()).toBeNull();
  });

  it('Back to Speak dispatches huntBack to speak without unlocking audio', () => {
    const { dispatch, unlockAudio } = setup();
    fireEvent.click(screen.getByTestId('hunt-reveal-back-speak'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'huntBack', target: 'speak' });
    expect(unlockAudio).not.toHaveBeenCalled();
  });
});

describe('HuntReveal clear and save notes', () => {
  it('asks first, naming the Hunt_ID and the found count, and clears nothing on cancel', () => {
    const { clear } = setup();
    fireEvent.click(screen.getByTestId('hunt-clear'));
    expect(screen.getByTestId('hunt-clear-confirm').textContent).toContain(
      'Clear Hunt ABCDEF? 1 found Spirit will be lost.',
    );
    fireEvent.click(screen.getByTestId('hunt-clear-no'));
    expect(clear).not.toHaveBeenCalled();
    expect(screen.queryByTestId('hunt-clear-confirm')).toBeNull();
    expect(screen.getByTestId('hunt-clear')).toBeTruthy();
  });

  it('clears the saved Hunt on confirm, says so, and resets the counter', () => {
    const { clear } = setup();
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(screen.getByText('Spirits found: 1 of 5')).toBeTruthy();
    fireEvent.click(screen.getByTestId('hunt-clear'));
    fireEvent.click(screen.getByTestId('hunt-clear-yes'));
    expect(clear).toHaveBeenCalledWith('ABCDEF');
    expect(screen.getByTestId('hunt-cleared').textContent).toBe(NOTE_CLEARED);
    expect(screen.getByText('Spirits found: 0 of 5')).toBeTruthy();
  });

  it('says the saved progress could not be cleared, and still resets the counter', () => {
    setup(intake(), () => ({ cleared: false }));
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    fireEvent.click(screen.getByTestId('hunt-clear'));
    fireEvent.click(screen.getByTestId('hunt-clear-yes'));
    const note = screen.getByTestId('hunt-clear-failed');
    expect(note.textContent).toBe(NOTE_CLEAR_FAILED);
    expect(note.getAttribute('role')).toBe('alert');
    expect(screen.getByText('Spirits found: 0 of 5')).toBeTruthy();
  });

  it('treats a throwing clear as a failed clear', () => {
    setup(intake(), () => {
      throw new Error('boom');
    });
    fireEvent.click(screen.getByTestId('hunt-clear'));
    fireEvent.click(screen.getByTestId('hunt-clear-yes'));
    expect(screen.getByTestId('hunt-clear-failed').textContent).toBe(NOTE_CLEAR_FAILED);
  });

  it('shows the not-saved note only when progress was not persisted', () => {
    setup(intake({ persisted: false }));
    expect(screen.getByTestId('hunt-not-saved').textContent).toBe(NOTE_NOT_SAVED);
    // Counter still reflects the in-memory find.
    fireEvent.click(screen.getByTestId('hunt-reveal-skip'));
    expect(screen.getByText('Spirits found: 1 of 5')).toBeTruthy();
  });

  it('shows no not-saved note when progress was persisted', () => {
    setup(intake({ persisted: true }));
    expect(screen.queryByTestId('hunt-not-saved')).toBeNull();
  });
});
