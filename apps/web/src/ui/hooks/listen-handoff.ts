import type { UnlockOutcome } from '../../audio/session';

/**
 * One-shot handoff from a Hunt screen to Listen. The Hunt screen calls
 * unlockAudio() inside its tap handler and queues the resulting promise here.
 * Listen takes it on mount and runs its normal start path, so no second tap is needed.
 */
export type ListenStart = Promise<UnlockOutcome>;

let queued: ListenStart | null = null;

/** Queue a start for the next Listen mount. A later call replaces an earlier one. */
export function queueListenStart(promise: ListenStart): void {
  queued = promise;
}

/** Return the queued start once, then clear it. Returns null when nothing is queued. */
export function takeListenStart(): ListenStart | null {
  const taken = queued;
  queued = null;
  return taken;
}
