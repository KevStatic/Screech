/** Thin wrapper over the Screen Wake Lock API. Never throws. */

export type WakeStatus = 'unsupported' | 'held' | 'released' | 'rejected' | 'idle';

export interface WakeController {
  /** Resolves 'held', 'rejected' or 'unsupported'. Safe to call while already held. */
  acquire(): Promise<WakeStatus>;
  /** Releases the lock if one is held. Resolves even when the release fails. */
  release(): Promise<void>;
  /** Called with 'released' when the browser drops the lock. Returns an unsubscribe function. */
  onChange(cb: (status: WakeStatus) => void): () => void;
}

interface SentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<SentinelLike>;
}

function readWakeLock(nav: Navigator | undefined): WakeLockLike | null {
  if (nav === undefined) return null;
  const candidate = (nav as unknown as { wakeLock?: Partial<WakeLockLike> }).wakeLock;
  if (candidate === undefined || candidate === null) return null;
  if (typeof candidate.request !== 'function') return null;
  return candidate as WakeLockLike;
}

export function createWakeController(
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): WakeController {
  const listeners = new Set<(status: WakeStatus) => void>();
  let sentinel: SentinelLike | null = null;
  let onRelease: (() => void) | null = null;
  // Bumped by release() so a request still in flight when we stop is dropped.
  let generation = 0;

  function emit(status: WakeStatus): void {
    for (const cb of [...listeners]) {
      try {
        cb(status);
      } catch {
        // A faulty listener must not break the controller.
      }
    }
  }

  function detach(): SentinelLike | null {
    const current = sentinel;
    if (current !== null && onRelease !== null) {
      try {
        current.removeEventListener('release', onRelease);
      } catch {
        // ignore
      }
    }
    sentinel = null;
    onRelease = null;
    return current;
  }

  async function acquire(): Promise<WakeStatus> {
    const wakeLock = readWakeLock(nav);
    if (wakeLock === null) return 'unsupported';
    if (sentinel !== null) return 'held';
    const mine = ++generation;
    let next: SentinelLike;
    try {
      next = await wakeLock.request('screen');
    } catch {
      return 'rejected';
    }
    if (mine !== generation || sentinel !== null) {
      // Released or re-acquired while the request was pending: hand the lock back.
      try {
        await next.release();
      } catch {
        // ignore
      }
      return mine !== generation ? 'released' : 'held';
    }
    const handler = (): void => {
      if (sentinel !== next) return;
      sentinel = null;
      onRelease = null;
      emit('released');
    };
    sentinel = next;
    onRelease = handler;
    try {
      next.addEventListener('release', handler);
    } catch {
      // ignore
    }
    return 'held';
  }

  async function release(): Promise<void> {
    generation += 1;
    const current = detach();
    if (current === null) return;
    try {
      await current.release();
    } catch {
      // Already released by the browser.
    }
  }

  function onChange(cb: (status: WakeStatus) => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }

  return { acquire, release, onChange };
}
