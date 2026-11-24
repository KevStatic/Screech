import { parseClueText } from '@screech/core';
import type { ClueFields, DecodedPacket, Result } from '@screech/core';
import { emptyFoundState, foundReducer } from './hunt-found';
import type { FoundState } from './hunt-found';
import type { ProgressStore } from './hunt-progress';

/**
 * Routes a decoded packet to the Ghost Hunt flow and applies a found clue to
 * the saved progress. Pure apart from the store the caller passes in.
 */
export type HuntRoute =
  /** Not a hunt packet: use screenState. */
  | { readonly kind: 'none' }
  /** The hunt-clue text did not parse. */
  | { readonly kind: 'garbled' }
  | { readonly kind: 'clue'; readonly fields: ClueFields };

const NONE: HuntRoute = { kind: 'none' };
const GARBLED: HuntRoute = { kind: 'garbled' };

/** Never throws. A multipart hunt-clue stays on the ignore path. */
export function huntRoute(result: Result<DecodedPacket>): HuntRoute {
  try {
    const r: unknown = result;
    if (typeof r !== 'object' || r === null) return NONE;
    const candidate = r as { ok?: unknown; value?: unknown };
    if (candidate.ok !== true) return NONE;
    const value = candidate.value;
    if (typeof value !== 'object' || value === null) return NONE;
    const packet = value as { multipart?: unknown; type?: unknown; payload?: unknown };
    if (packet.multipart !== false || packet.type !== 'hunt-clue') return NONE;
    const payload = packet.payload as { type?: unknown; text?: unknown } | null;
    if (typeof payload !== 'object' || payload === null) return GARBLED;
    const parsed = parseClueText(payload.text);
    return parsed.ok ? { kind: 'clue', fields: parsed.value } : GARBLED;
  } catch {
    return NONE;
  }
}

export type HuntIntake =
  | {
      readonly kind: 'new';
      readonly fields: ClueFields;
      readonly before: FoundState;
      readonly state: FoundState;
      readonly persisted: boolean;
    }
  | { readonly kind: 'already'; readonly fields: ClueFields; readonly storedName: string }
  | { readonly kind: 'complete'; readonly fields: ClueFields; readonly state: FoundState };

export type HuntNavIntake = Exclude<HuntIntake, { readonly kind: 'already' }>;

/**
 * Applies a clue to the saved progress. `new` is saved before this returns;
 * `already` and `complete` write nothing.
 */
export function huntIntake(store: ProgressStore, fields: ClueFields, nowMs: number): HuntIntake {
  const loaded = store.load(fields.huntId);
  const before =
    loaded !== null && loaded.huntId === fields.huntId && loaded.total === fields.total
      ? loaded
      : emptyFoundState(fields);
  if (before.completedAt !== null) {
    return { kind: 'complete', fields, state: before };
  }
  const state = foundReducer(before, fields, nowMs);
  if (state === before) {
    const entry = before.found.find((item) => item.index === fields.index);
    return { kind: 'already', fields, storedName: entry === undefined ? fields.name : entry.name };
  }
  const { persisted } = store.save(state);
  return { kind: 'new', fields, before, state, persisted };
}
