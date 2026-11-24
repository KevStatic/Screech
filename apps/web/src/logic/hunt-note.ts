/**
 * Listen-side Already_Note state. Pure: no React, no audio, no storage.
 * The held clue text lives in memory only and is never persisted.
 */
import type { ClueFields } from '@screech/core';

export interface AlreadyNote {
  readonly huntId: string;
  readonly index: number;
  readonly total: number;
  /** Name stored at the first find. */
  readonly name: string;
  /** Held in memory only, for the Read_Again_Control. */
  readonly clue: string;
  readonly clueShown: boolean;
  /** Changes only when a different note replaces this one. */
  readonly announceId: number;
}

export interface NoteState {
  readonly note: AlreadyNote | null;
  readonly nextId: number;
}

export type NoteEvent =
  | { readonly type: 'already'; readonly fields: ClueFields; readonly storedName: string }
  | { readonly type: 'readAgain' }
  | { readonly type: 'clear' };

export const EMPTY_NOTE: NoteState = { note: null, nextId: 1 };

export function noteReducer(state: NoteState, event: NoteEvent): NoteState {
  switch (event.type) {
    case 'already': {
      const { fields, storedName } = event;
      const current = state.note;
      if (current !== null && current.huntId === fields.huntId && current.index === fields.index) {
        return state;
      }
      return {
        note: {
          huntId: fields.huntId,
          index: fields.index,
          total: fields.total,
          name: storedName,
          clue: fields.clue,
          clueShown: false,
          announceId: state.nextId,
        },
        nextId: state.nextId + 1,
      };
    }
    case 'readAgain':
      if (state.note === null || state.note.clueShown) return state;
      return { ...state, note: { ...state.note, clueShown: true } };
    case 'clear':
      return EMPTY_NOTE;
  }
}

export function noteText(note: AlreadyNote): string {
  return `Already found \u00b7 Spirit ${note.index} of ${note.total} \u00b7 ${note.name}`;
}
