import { isExpired } from './seance.js';
import type { SeanceStore } from './seance-store.js';

export interface CleanupDeps {
  readonly store: SeanceStore;
  /** Epoch milliseconds. Injected so tests control the clock. */
  readonly now: () => number;
}

export interface CleanupResult {
  /** Session IDs whose séance and check-ins were deleted. */
  readonly deleted: readonly string[];
}

/**
 * Deletes every séance that is 24 hours old or more, together with its
 * check-ins (requirement 17.6). Open and ended séances under 24 hours old are
 * kept, so an ended séance stays readable (9.5). Run on a schedule, never from
 * request handling.
 *
 * `getSeance` returns null for an expired séance, so a listed ID with a null
 * result counts as expired. A séance the store still returns is also checked
 * against this function's own clock.
 */
export async function runCleanup(deps: CleanupDeps): Promise<CleanupResult> {
  const { store, now } = deps;
  const deleted: string[] = [];
  for (const sessionId of await store.listSeanceIds()) {
    const seance = await store.getSeance(sessionId);
    if (seance === null || isExpired(seance, now())) {
      await store.deleteSeance(sessionId);
      deleted.push(sessionId);
    }
  }
  return { deleted };
}
