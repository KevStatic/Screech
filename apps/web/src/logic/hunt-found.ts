import type { ClueFields } from '@screech/core';

/**
 * Found state of one Ghost Hunt on one phone. Pure: no React, no audio, no
 * clock, no storage. The caller passes the time in.
 */

export interface FoundEntry {
  readonly index: number;
  readonly name: string;
}

export interface FoundState {
  readonly huntId: string;
  readonly total: number;
  /** Ascending by index, no duplicates. */
  readonly found: readonly FoundEntry[];
  readonly firstFoundAt: number | null;
  readonly completedAt: number | null;
}

export function emptyFoundState(fields: Pick<ClueFields, 'huntId' | 'total'>): FoundState {
  return {
    huntId: fields.huntId,
    total: fields.total,
    found: [],
    firstFoundAt: null,
    completedAt: null,
  };
}

/**
 * Returns the same object when the Hunt_ID or total differs, the index is
 * already found, or the Hunt is complete. Otherwise returns a new state.
 */
export function foundReducer(state: FoundState, fields: ClueFields, nowMs: number): FoundState {
  if (fields.huntId !== state.huntId || fields.total !== state.total) return state;
  if (state.completedAt !== null) return state;
  if (state.found.some((entry) => entry.index === fields.index)) return state;

  const found = [...state.found, { index: fields.index, name: fields.name }].sort(
    (a, b) => a.index - b.index,
  );
  return {
    huntId: state.huntId,
    total: state.total,
    found,
    firstFoundAt: state.found.length === 0 ? nowMs : state.firstFoundAt,
    completedAt: found.length === state.total ? nowMs : null,
  };
}

/** Whole seconds from first find to completion. 0 when either is missing or the gap is negative. */
export function timeTakenSeconds(state: FoundState): number {
  const { firstFoundAt, completedAt } = state;
  if (firstFoundAt === null || completedAt === null) return 0;
  const seconds = Math.floor((completedAt - firstFoundAt) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** 'M:SS', minutes uncapped. */
export function formatTimeTaken(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export interface CounterRow {
  readonly index: number;
  /** null means not found yet ("unknown"). */
  readonly name: string | null;
}

/** Exactly `total` rows, indices 1 to total. Never exposes names of unfound Spirits. */
export function counterRows(state: FoundState): readonly CounterRow[] {
  const names = new Map<number, string>();
  for (const entry of state.found) names.set(entry.index, entry.name);
  const rows: CounterRow[] = [];
  for (let index = 1; index <= state.total; index += 1) {
    rows.push({ index, name: names.get(index) ?? null });
  }
  return rows;
}

export function counterHeading(state: FoundState): string {
  const count = counterRows(state).filter((row) => row.name !== null).length;
  return `Spirits found: ${count} of ${state.total}`;
}
