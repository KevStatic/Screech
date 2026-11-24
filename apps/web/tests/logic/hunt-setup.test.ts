import { describe, it, expect } from 'vitest';
import { buildClue } from '@screech/core';
import {
  fillPack,
  initialDraft,
  rowStatus,
  setupReducer,
  setupView,
  type SetupDraft,
} from '../../src/logic/hunt-setup';

const HUNT = 'ABCDEF';

/** Letters that do not repeat in a pattern, so compression cannot shrink the packet. */
function noise(length: number): string {
  let seed = 12345;
  let out = '';
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out += String.fromCharCode(97 + ((seed >> 8) % 26));
  }
  return out;
}

/** Clue text that makes row 1's Packet exactly `size` bytes. */
function clueForSize(size: number): string {
  for (let n = 1; n < 300; n++) {
    const clue = noise(n);
    const built = buildClue({ huntId: HUNT, index: 1, total: 3, name: 'Ghost', clue });
    if (built.ok && built.value.length === size) return clue;
  }
  throw new Error(`no clue gives ${size} bytes`);
}

function validDraft(): SetupDraft {
  return fillPack(initialDraft(), 'office', 3);
}

function withClue(clue: string): SetupDraft {
  const draft = validDraft();
  return {
    ...draft,
    rows: draft.rows.map((r, i) => (i === 0 ? { ...r, name: 'Ghost', clue } : r)),
  };
}

describe('rowStatus sizes', () => {
  it('100 bytes has no long note', () => {
    const s = rowStatus(HUNT, withClue(clueForSize(100)), 0);
    expect(s.kind).toBe('ok');
    if (s.kind === 'ok') {
      expect(s.size).toBe(100);
      expect(s.longNote).toBeNull();
      expect(s.label).toBe('100/140 bytes \u00b7 about 7 s');
    }
  });

  it('101 bytes has the long note', () => {
    const s = rowStatus(HUNT, withClue(clueForSize(101)), 0);
    expect(s.kind).toBe('ok');
    if (s.kind === 'ok') expect(s.longNote).toContain('about 7 s');
  });

  it('140 bytes is ok, not an error', () => {
    const s = rowStatus(HUNT, withClue(clueForSize(140)), 0);
    expect(s.kind).toBe('ok');
    if (s.kind === 'ok') expect(s.label).toBe('140/140 bytes \u00b7 about 10 s');
  });

  it('a Packet over 140 bytes says it is too heavy', () => {
    const s = rowStatus(HUNT, withClue(noise(200)), 0);
    expect(s.kind).toBe('too-large');
    if (s.kind === 'too-large') {
      expect(s.label).toBe(`Too heavy to cross over (${s.length}/140 bytes)`);
      expect(s.length).toBeGreaterThan(140);
    }
  });

  it('a row that does not exist is invalid', () => {
    expect(rowStatus(HUNT, validDraft(), 9).kind).toBe('invalid');
  });
});

describe('setupView', () => {
  it('a valid pack draft can make links', () => {
    const view = setupView(HUNT, validDraft());
    expect(view.canMakeLinks).toBe(true);
    expect(view.summary).toBeNull();
  });

  it('without a Hunt_ID links are blocked', () => {
    expect(setupView(null, validDraft()).canMakeLinks).toBe(false);
  });

  it('names an incomplete row in the summary and keeps the typed text', () => {
    let draft = validDraft();
    draft = setupReducer(draft, { type: 'edit', row: 2, field: 'clue', value: '   ' });
    const view = setupView(HUNT, draft);
    expect(view.canMakeLinks).toBe(false);
    expect(view.summary).toBe('Spirit 3 has no clue.');
    expect(draft.rows[2]!.clue).toBe('   ');
  });

  it('Hide_At of 40 characters is fine, 41 is blocked', () => {
    const at = (n: number) => setupReducer(validDraft(), { type: 'edit', row: 0, field: 'hideAt', value: 'h'.repeat(n) });
    expect(setupView(HUNT, at(40)).canMakeLinks).toBe(true);
    const over = setupView(HUNT, at(41));
    expect(over.canMakeLinks).toBe(false);
    expect(over.limitProblems).toEqual(['Spirit 1: Hide at is 41/40 characters']);
    expect(over.summary).toBe('Spirit 1: Hide at is 41/40 characters');
  });

  it('opening of 200 characters is fine, 201 is blocked', () => {
    const at = (n: number) => setupReducer(validDraft(), { type: 'editOpening', value: 'o'.repeat(n) });
    expect(setupView(HUNT, at(200)).canMakeLinks).toBe(true);
    const over = setupView(HUNT, at(201));
    expect(over.canMakeLinks).toBe(false);
    expect(over.limitProblems).toEqual(['Opening riddle is 201/200 characters']);
  });
});
