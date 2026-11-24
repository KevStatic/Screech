import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ClueFields } from '@screech/core';
import {
  EMPTY_NOTE,
  noteReducer,
  noteText,
  type NoteEvent,
  type NoteState,
} from '../../src/logic/hunt-note';

const fieldsArb: fc.Arbitrary<ClueFields> = fc.record({
  huntId: fc.constantFrom('AAAAAA', 'BBBBBB'),
  index: fc.integer({ min: 1, max: 3 }),
  total: fc.integer({ min: 3, max: 7 }),
  name: fc.string({ maxLength: 12 }),
  clue: fc.string({ maxLength: 20 }),
});

const eventArb: fc.Arbitrary<NoteEvent> = fc.oneof(
  fc.record({
    type: fc.constant('already' as const),
    fields: fieldsArb,
    storedName: fc.string({ maxLength: 12 }),
  }),
  fc.constant<NoteEvent>({ type: 'readAgain' }),
  fc.constant<NoteEvent>({ type: 'clear' }),
);

// Feature: ghost-hunt, Property 29: Already_Note state
describe('Property 29: Already_Note state', () => {
  it('keeps the note invariants across any event sequence', () => {
    // **Validates: Requirements 10.8, 10.9, 10.15, 10.16, 10.17**
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        let state: NoteState = EMPTY_NOTE;
        for (const event of events) {
          const before = state;
          state = noteReducer(before, event);

          if (event.type === 'clear') {
            expect(state).toEqual(EMPTY_NOTE);
            expect(state.note).toBeNull();
          } else if (event.type === 'readAgain') {
            if (before.note === null) {
              expect(state).toBe(before);
            } else {
              expect(state.note).toEqual({ ...before.note, clueShown: true });
              expect(state.note?.announceId).toBe(before.note.announceId);
            }
          } else {
            const { fields, storedName } = event;
            const cur = before.note;
            if (cur !== null && cur.huntId === fields.huntId && cur.index === fields.index) {
              expect(state).toEqual(before);
            } else {
              expect(state.note).not.toBeNull();
              expect(state.note?.huntId).toBe(fields.huntId);
              expect(state.note?.index).toBe(fields.index);
              expect(state.note?.total).toBe(fields.total);
              expect(state.note?.name).toBe(storedName);
              expect(state.note?.clueShown).toBe(false);
              expect(state.note?.announceId).toBe(before.nextId);
              expect(state.nextId).toBeGreaterThan(before.nextId);
              expect(noteText(state.note!)).toBe(
                `Already found \u00b7 Spirit ${fields.index} of ${fields.total} \u00b7 ${storedName}`,
              );
            }
          }
        }
        // A note exists only if an already event came after the last clear.
        let lastClear = -1;
        events.forEach((e, i) => {
          if (e.type === 'clear') lastClear = i;
        });
        const alreadyAfterClear = events.slice(lastClear + 1).some((e) => e.type === 'already');
        expect(state.note !== null).toBe(alreadyAfterClear);
      }),
      { numRuns: 200 },
    );
  });
});

describe('hunt-note unit tests', () => {
  const fields: ClueFields = {
    huntId: 'ABCDEF',
    index: 2,
    total: 5,
    name: 'Old Marrow',
    clue: 'Under the stairs',
  };

  it('formats the note text', () => {
    const s = noteReducer(EMPTY_NOTE, { type: 'already', fields, storedName: 'Old Marrow' });
    expect(s.note).not.toBeNull();
    expect(noteText(s.note!)).toBe('Already found \u00b7 Spirit 2 of 5 \u00b7 Old Marrow');
  });

  it('replaces the note and hides the clue for the same index in another Hunt_ID', () => {
    let s = noteReducer(EMPTY_NOTE, { type: 'already', fields, storedName: 'Old Marrow' });
    s = noteReducer(s, { type: 'readAgain' });
    expect(s.note?.clueShown).toBe(true);
    const firstId = s.note!.announceId;

    const other = noteReducer(s, {
      type: 'already',
      fields: { ...fields, huntId: 'ZZZZZZ' },
      storedName: 'Pale Wren',
    });
    expect(other).not.toBe(s);
    expect(other.note?.huntId).toBe('ZZZZZZ');
    expect(other.note?.name).toBe('Pale Wren');
    expect(other.note?.clueShown).toBe(false);
    expect(other.note?.announceId).not.toBe(firstId);
  });

  it('returns the same state for a repeat of the same Spirit', () => {
    const s = noteReducer(EMPTY_NOTE, { type: 'already', fields, storedName: 'Old Marrow' });
    expect(noteReducer(s, { type: 'already', fields, storedName: 'Old Marrow' })).toBe(s);
  });
});
