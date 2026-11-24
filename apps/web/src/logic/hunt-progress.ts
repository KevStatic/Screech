import { HUNT_ALPHABET, HUNT_ID_LENGTH, SPIRIT_TOTAL_MAX, SPIRIT_TOTAL_MIN, validateClueFields } from '@screech/core';
import type { FoundEntry, FoundState } from './hunt-found';

/**
 * Saved progress of Ghost Hunts. Storage is a parameter, never a global, and
 * is only touched inside try. Stored JSON holds no clue text, Hide_At or opening.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROGRESS_KEY_PREFIX = 'screech.hunt.';

const STORED_VERSION = 1;

export function serializeFoundState(state: FoundState): string {
  return JSON.stringify({
    v: STORED_VERSION,
    huntId: state.huntId,
    total: state.total,
    found: state.found.map((entry) => [entry.index, entry.name]),
    first: state.firstFoundAt,
    done: state.completedAt,
  });
}

function isHuntId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== HUNT_ID_LENGTH) return false;
  for (const ch of value) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A name is valid when the clue rules accept it unchanged (non-empty, no control characters, 24 bytes at most). */
function isStoredName(value: unknown, huntId: string, total: number): value is string {
  if (typeof value !== 'string') return false;
  const checked = validateClueFields({ huntId, index: 1, total, name: value, clue: 'x' });
  return checked.ok && checked.value.name === value;
}

/** Returns null for anything that is not a valid Found_State of `expectedHuntId`. Never throws. */
export function parseFoundState(text: string, expectedHuntId: string): FoundState | null {
  try {
    if (typeof text !== 'string') return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (obj['v'] !== STORED_VERSION) return null;
    const huntId = obj['huntId'];
    if (!isHuntId(huntId) || huntId !== expectedHuntId) return null;
    const total = obj['total'];
    if (
      typeof total !== 'number' ||
      !Number.isInteger(total) ||
      total < SPIRIT_TOTAL_MIN ||
      total > SPIRIT_TOTAL_MAX
    ) {
      return null;
    }
    const rawFound = obj['found'];
    if (!Array.isArray(rawFound) || rawFound.length > total) return null;
    const found: FoundEntry[] = [];
    let previous = 0;
    for (const item of rawFound as unknown[]) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const index: unknown = item[0];
      const name: unknown = item[1];
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > total) return null;
      if (index <= previous) return null;
      if (!isStoredName(name, huntId, total)) return null;
      previous = index;
      found.push({ index, name });
    }
    const first = obj['first'];
    const done = obj['done'];
    if (found.length === 0) {
      if (first !== null) return null;
    } else if (!isTime(first)) {
      return null;
    }
    if (found.length === total) {
      if (done !== null && !isTime(done)) return null;
    } else if (done !== null) {
      return null;
    }
    return {
      huntId,
      total,
      found,
      firstFoundAt: first as number | null,
      completedAt: done as number | null,
    };
  } catch {
    return null;
  }
}

export interface ProgressStore {
  /** null means nothing valid saved. */
  load(huntId: string): FoundState | null;
  save(state: FoundState): { readonly persisted: boolean };
  clear(huntId: string): { readonly cleared: boolean };
}

export function createProgressStore(storage: StorageLike | null): ProgressStore {
  const memory = new Map<string, FoundState>();
  const keyFor = (huntId: string): string => `${PROGRESS_KEY_PREFIX}${huntId}`;

  return {
    load(huntId) {
      if (storage !== null) {
        try {
          const text = storage.getItem(keyFor(huntId));
          if (text !== null) {
            const parsed = parseFoundState(text, huntId);
            if (parsed !== null) return parsed;
          }
        } catch {
          // unreadable storage: fall back to memory
        }
      }
      return memory.get(huntId) ?? null;
    },
    save(state) {
      memory.set(state.huntId, state);
      if (storage === null) return { persisted: false };
      try {
        storage.setItem(keyFor(state.huntId), serializeFoundState(state));
        return { persisted: true };
      } catch {
        return { persisted: false };
      }
    },
    clear(huntId) {
      memory.delete(huntId);
      if (storage === null) return { cleared: true };
      try {
        storage.removeItem(keyFor(huntId));
        return { cleared: true };
      } catch {
        return { cleared: false };
      }
    },
  };
}
