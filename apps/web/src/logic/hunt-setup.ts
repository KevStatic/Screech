/**
 * Host-side Ghost Hunt setup draft: reducer, row status and view model.
 * Pure: no React, no audio, no clock, no storage. Typed text is never changed
 * by validation.
 */
import {
  HUNT_ALPHABET,
  HUNT_ID_LENGTH,
  SIZE_CAP,
  SPIRIT_TOTAL_MAX,
  SPIRIT_TOTAL_MIN,
  buildClue,
  sanitizeClueText,
} from '@screech/core';
import { airtimeSeconds, longClueNote } from './airtime';
import { RIDDLE_PACKS, type PackId } from './riddle-packs';

export const HIDE_AT_MAX = 40;
export const OPENING_MAX = 200;
export const SETUP_ROW_COUNT = SPIRIT_TOTAL_MAX;
export const DEFAULT_TOTAL = 5;

export interface CustomMarks {
  readonly name: boolean;
  readonly hideAt: boolean;
  readonly clue: boolean;
}

export interface SetupRow {
  readonly name: string;
  readonly hideAt: string;
  readonly clue: string;
  readonly custom: CustomMarks;
}

export interface SetupDraft {
  /** 3..7, default 5. */
  readonly total: number;
  /** Opening_Riddle. */
  readonly opening: string;
  readonly openingCustom: boolean;
  /** Always 7 rows. Rows beyond `total` are kept in memory. */
  readonly rows: readonly SetupRow[];
  readonly appliedPack: PackId | null;
  /** Pack waiting for the host to confirm an overwrite. */
  readonly pendingPack: PackId | null;
  /** "Pack text was not filled again" note. */
  readonly packNote: boolean;
}

export type RowField = 'name' | 'hideAt' | 'clue';

export type SetupAction =
  | { type: 'setTotal'; total: number }
  | { type: 'edit'; row: number; field: RowField; value: string }
  | { type: 'editOpening'; value: string }
  | { type: 'choosePack'; pack: PackId }
  | { type: 'confirmPack' }
  | { type: 'cancelPack' };

const NO_MARKS: CustomMarks = { name: false, hideAt: false, clue: false };

function emptyRow(): SetupRow {
  return { name: '', hideAt: '', clue: '', custom: NO_MARKS };
}

export function initialDraft(): SetupDraft {
  return {
    total: DEFAULT_TOTAL,
    opening: '',
    openingCustom: false,
    rows: Array.from({ length: SETUP_ROW_COUNT }, emptyRow),
    appliedPack: null,
    pendingPack: null,
    packNote: false,
  };
}

function isValidTotal(total: unknown): total is number {
  return (
    typeof total === 'number' &&
    Number.isInteger(total) &&
    total >= SPIRIT_TOTAL_MIN &&
    total <= SPIRIT_TOTAL_MAX
  );
}

function rowHasCustom(row: SetupRow): boolean {
  return row.custom.name || row.custom.hideAt || row.custom.clue;
}

/** Number of fields among rows 1..count (and optionally the opening) that hold Custom_Text. */
function countCustom(draft: SetupDraft, rowCount: number): number {
  let n = draft.openingCustom ? 1 : 0;
  for (let i = 0; i < rowCount; i++) {
    const row = draft.rows[i];
    if (row === undefined) continue;
    if (row.custom.name) n++;
    if (row.custom.hideAt) n++;
    if (row.custom.clue) n++;
  }
  return n;
}

/** Fields that a pack fill for the current total would overwrite and that hold Custom_Text. */
export function customCountToOverwrite(draft: SetupDraft): number {
  return countCustom(draft, draft.total);
}

/**
 * Fill rows 1..total-1 with entries 1..total-1, row `total` with the name and
 * Hide_At of entry `total` and the finale as its clue, and the opening.
 * Rows after `total` are left as they are. Written fields lose their
 * Custom_Text mark.
 */
export function fillPack(draft: SetupDraft, pack: PackId, total: number): SetupDraft {
  const data = RIDDLE_PACKS[pack];
  const rows = draft.rows.map((row, i): SetupRow => {
    if (i >= total) return row;
    const entry = data.entries[i];
    if (entry === undefined) return row;
    const clue = i === total - 1 ? data.finale : entry.clue;
    return { name: entry.name, hideAt: entry.hideAt, clue, custom: NO_MARKS };
  });
  return {
    ...draft,
    total,
    opening: data.opening,
    openingCustom: false,
    rows,
    appliedPack: pack,
    pendingPack: null,
    packNote: false,
  };
}

export function setupReducer(draft: SetupDraft, action: SetupAction): SetupDraft {
  switch (action.type) {
    case 'setTotal': {
      if (!isValidTotal(action.total) || action.total === draft.total) return draft;
      const next: SetupDraft = { ...draft, total: action.total, pendingPack: null };
      if (draft.appliedPack === null) return { ...next, packNote: false };
      if (countCustom(draft, SETUP_ROW_COUNT) === 0) {
        return fillPack(next, draft.appliedPack, action.total);
      }
      return { ...next, packNote: true };
    }
    case 'edit': {
      const current = draft.rows[action.row];
      if (current === undefined || typeof action.value !== 'string') return draft;
      const row: SetupRow = {
        ...current,
        [action.field]: action.value,
        custom: { ...current.custom, [action.field]: action.value.trim() !== '' },
      };
      return { ...draft, rows: draft.rows.map((r, i) => (i === action.row ? row : r)) };
    }
    case 'editOpening':
      if (typeof action.value !== 'string') return draft;
      return { ...draft, opening: action.value, openingCustom: action.value.trim() !== '' };
    case 'choosePack':
      if (!(action.pack in RIDDLE_PACKS)) return draft;
      if (customCountToOverwrite(draft) === 0) {
        return fillPack(draft, action.pack, draft.total);
      }
      return { ...draft, pendingPack: action.pack };
    case 'confirmPack':
      if (draft.pendingPack === null) return draft;
      return fillPack(draft, draft.pendingPack, draft.total);
    case 'cancelPack':
      if (draft.pendingPack === null) return draft;
      return { ...draft, pendingPack: null };
  }
}

/** Code points after control characters become spaces and the text is trimmed. */
export function measureText(value: string): number {
  return [...sanitizeClueText(value)].length;
}

export type RowStatus =
  | { kind: 'ok'; size: number; label: string; longNote: string | null }
  | { kind: 'too-large'; length: number; label: string }
  | { kind: 'invalid'; field: string; label: string };

/** Status of one row (0-based index). Uses the same buildClue call as the Beacon. */
export function rowStatus(huntId: string, draft: SetupDraft, row: number): RowStatus {
  const data = draft.rows[row];
  if (data === undefined) {
    return { kind: 'invalid', field: 'index', label: `Spirit ${row + 1} does not exist` };
  }
  const built = buildClue({
    huntId,
    index: row + 1,
    total: draft.total,
    name: data.name,
    clue: data.clue,
  });
  if (built.ok) {
    const size = built.value.length;
    return {
      kind: 'ok',
      size,
      label: `${size}/${SIZE_CAP} bytes · about ${airtimeSeconds(size)} s`,
      longNote: longClueNote(size),
    };
  }
  const error = built.error;
  if (error.code === 'too-large') {
    return {
      kind: 'too-large',
      length: error.length,
      label: `Too heavy to cross over (${error.length}/${SIZE_CAP} bytes)`,
    };
  }
  const field = error.code === 'invalid-payload' ? error.field : 'clue';
  return { kind: 'invalid', field, label: error.message };
}

export interface SetupView {
  readonly statuses: readonly RowStatus[];
  readonly limitProblems: readonly string[];
  readonly summary: string | null;
  readonly canMakeLinks: boolean;
}

/** Stand-in id so row sizes can be shown before a real Hunt_ID exists. */
const PLACEHOLDER_HUNT_ID = HUNT_ALPHABET.slice(0, HUNT_ID_LENGTH);

function incompleteMessage(draft: SetupDraft, row: number): string | null {
  const data = draft.rows[row];
  if (data === undefined) return null;
  const missing: string[] = [];
  if (sanitizeClueText(data.name) === '') missing.push('name');
  if (sanitizeClueText(data.clue) === '') missing.push('clue');
  if (missing.length === 0) return null;
  return `Spirit ${row + 1} has no ${missing.join(' and no ')}`;
}

export function setupView(huntId: string | null, draft: SetupDraft): SetupView {
  const id = huntId ?? PLACEHOLDER_HUNT_ID;
  const statuses: RowStatus[] = [];
  const limitProblems: string[] = [];
  for (let i = 0; i < draft.total; i++) {
    statuses.push(rowStatus(id, draft, i));
    const hideLength = measureText(draft.rows[i]?.hideAt ?? '');
    if (hideLength > HIDE_AT_MAX) {
      limitProblems.push(`Spirit ${i + 1}: Hide at is ${hideLength}/${HIDE_AT_MAX} characters`);
    }
  }
  const openingLength = measureText(draft.opening);
  if (openingLength > OPENING_MAX) {
    limitProblems.push(`Opening riddle is ${openingLength}/${OPENING_MAX} characters`);
  }

  const firstBad = statuses.findIndex((s) => s.kind !== 'ok');
  let summary: string | null = null;
  if (firstBad >= 0) {
    const incomplete: string[] = [];
    for (let i = 0; i < draft.total; i++) {
      const m = incompleteMessage(draft, i);
      if (m !== null) incomplete.push(m);
    }
    const firstStatus = statuses[firstBad];
    if (incompleteMessage(draft, firstBad) !== null) {
      summary = `${incomplete.join('. ')}.`;
    } else if (firstStatus !== undefined) {
      summary = `Spirit ${firstBad + 1}: ${firstStatus.label}`;
    }
  } else if (limitProblems.length > 0) {
    summary = limitProblems[0] ?? null;
  }

  return {
    statuses,
    limitProblems,
    summary,
    canMakeLinks: huntId !== null && firstBad < 0 && limitProblems.length === 0,
  };
}

/** True when any active row holds Custom_Text (helper for the UI). */
export function hasCustomText(draft: SetupDraft): boolean {
  return draft.openingCustom || draft.rows.some(rowHasCustom);
}
