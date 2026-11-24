// Feature: ghost-hunt, task 8.10: AlreadyNote (Requirements 13.1 to 13.4, 13.7, 13.8, 13.10, 13.11)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import AlreadyNote from '../../src/ui/components/AlreadyNote';
import { EMPTY_NOTE, noteReducer } from '../../src/logic/hunt-note';
import type { NoteState } from '../../src/logic/hunt-note';
import type { ClueFields } from '@screech/core';

function fields(index: number, clue: string): ClueFields {
  return { huntId: 'h1', index, total: 5, name: 'Mabel', clue } as ClueFields;
}

function withNote(index = 2, clue = 'Behind the old clock'): NoteState {
  return noteReducer(EMPTY_NOTE, {
    type: 'already',
    fields: fields(index, clue),
    storedName: 'Mabel',
  });
}

afterEach(() => {
  cleanup();
});

describe('AlreadyNote', () => {
  it('renders an empty polite live region and no button without a note', () => {
    render(createElement(AlreadyNote, { state: EMPTY_NOTE, onReadAgain: () => {} }));
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the exact note text and a Read clue again button', () => {
    render(createElement(AlreadyNote, { state: withNote(), onReadAgain: () => {} }));
    expect(screen.getByRole('status').textContent).toBe(
      'Already found \u00b7 Spirit 2 of 5 \u00b7 Mabel',
    );
    expect(screen.getByRole('button', { name: 'Read clue again' })).toBeTruthy();
    expect(screen.queryByTestId('already-note-clue')).toBeNull();
  });

  it('calls onReadAgain when the button is pressed', () => {
    const onReadAgain = vi.fn();
    render(createElement(AlreadyNote, { state: withNote(), onReadAgain }));
    fireEvent.click(screen.getByRole('button', { name: 'Read clue again' }));
    expect(onReadAgain).toHaveBeenCalledTimes(1);
  });

  it('shows the clue as plain text outside the live region after reading again', () => {
    const state = noteReducer(withNote(), { type: 'readAgain' });
    render(createElement(AlreadyNote, { state, onReadAgain: () => {} }));
    const clue = screen.getByTestId('already-note-clue');
    expect(clue.textContent).toBe('Behind the old clock');
    expect(screen.getByRole('status').contains(clue)).toBe(false);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render a link in the clue', () => {
    const clue = 'Go to https://example.com or <a href="https://evil.test">here</a>';
    const state = noteReducer(withNote(2, clue), { type: 'readAgain' });
    const { container } = render(createElement(AlreadyNote, { state, onReadAgain: () => {} }));
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByTestId('already-note-clue').textContent).toBe(clue);
  });

  it('does not re-announce the same note on a re-render or when the clue is shown', () => {
    const first = withNote();
    const { rerender } = render(createElement(AlreadyNote, { state: first, onReadAgain: () => {} }));
    const span = screen.getByRole('status').querySelector('span');
    expect(span).not.toBeNull();

    // Same scan again: reducer returns the same state, so the text node is kept.
    const same = noteReducer(first, {
      type: 'already',
      fields: fields(2, 'Behind the old clock'),
      storedName: 'Mabel',
    });
    expect(same).toBe(first);
    rerender(createElement(AlreadyNote, { state: same, onReadAgain: () => {} }));
    expect(screen.getByRole('status').querySelector('span')).toBe(span);

    // Showing the clue keeps the same announced node.
    rerender(
      createElement(AlreadyNote, {
        state: noteReducer(first, { type: 'readAgain' }),
        onReadAgain: () => {},
      }),
    );
    expect(screen.getByRole('status').querySelector('span')).toBe(span);
  });

  it('announces a different note as a new node', () => {
    const first = withNote(2);
    const { rerender } = render(createElement(AlreadyNote, { state: first, onReadAgain: () => {} }));
    const span = screen.getByRole('status').querySelector('span');
    const next = noteReducer(first, {
      type: 'already',
      fields: fields(3, 'Under the stairs'),
      storedName: 'Ada',
    });
    rerender(createElement(AlreadyNote, { state: next, onReadAgain: () => {} }));
    expect(screen.getByRole('status').querySelector('span')).not.toBe(span);
    expect(screen.getByRole('status').textContent).toBe(
      'Already found \u00b7 Spirit 3 of 5 \u00b7 Ada',
    );
  });
});
