import { createProgressStore } from '../../logic/hunt-progress';
import type { ProgressStore, StorageLike } from '../../logic/hunt-progress';

/** One shared ProgressStore for the whole app, created on first use. */

let store: ProgressStore | null = null;

function pickStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getProgressStore(): ProgressStore {
  if (store === null) store = createProgressStore(pickStorage());
  return store;
}

/** Test helper: drops the singleton so the next getProgressStore() builds a fresh one. */
export function resetProgressStoreForTests(): void {
  store = null;
}
