export const DEDUPE_WINDOW_MS = 5000;

/** key -> time (ms) it was last shown. */
export type DedupeState = ReadonlyMap<string, number>;

/**
 * Shows an event unless the same key was shown less than DEDUPE_WINDOW_MS ago.
 * Only shown events update the map. Keys older than the window are dropped.
 * Pure: the input map is never mutated.
 */
export function dedupeStep(
  state: DedupeState,
  key: string,
  nowMs: number,
): { readonly show: boolean; readonly state: DedupeState } {
  const next = new Map<string, number>();
  for (const [k, shownAt] of state) {
    if (nowMs - shownAt < DEDUPE_WINDOW_MS) next.set(k, shownAt);
  }
  const last = state.get(key);
  const show = last === undefined || nowMs - last >= DEDUPE_WINDOW_MS;
  if (show) next.set(key, nowMs);
  return { show, state: next };
}
