import { useSyncExternalStore } from 'react';
import {
  EXORCISE_KEY,
  parseExorcise,
  resolveReducedMotion,
  serializeExorcise,
} from '../../logic/motion';

export interface MotionState {
  /** Saved Exorcise toggle (in-memory copy; storage may be unavailable). */
  readonly toggle: boolean;
  /** System `prefers-reduced-motion: reduce`. */
  readonly system: boolean;
  /** Effective value: toggle or system. */
  readonly reduced: boolean;
}

const QUERY = '(prefers-reduced-motion: reduce)';

let toggle = false;
let system = false;
let state: MotionState = { toggle, system, reduced: false };
let initialised = false;
const listeners = new Set<() => void>();

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(EXORCISE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    window.localStorage.setItem(EXORCISE_KEY, value);
  } catch {
    // Storage unavailable: the in-memory value still applies.
  }
}

function getMedia(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

function publish(): void {
  const reduced = resolveReducedMotion(toggle, system);
  state = { toggle, system, reduced };
  document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  listeners.forEach((l) => l());
}

/** Call once before the first render. Safe to call repeatedly. */
export function initMotion(): void {
  if (initialised) return;
  initialised = true;
  toggle = parseExorcise(readStorage());
  const media = getMedia();
  system = media?.matches ?? false;
  media?.addEventListener('change', (e: MediaQueryListEvent) => {
    // Updates the effective value only; the saved toggle is left untouched.
    system = e.matches;
    publish();
  });
  publish();
}

/** Set the Exorcise toggle, persist it and update the root attribute synchronously. */
export function setExorcise(on: boolean): void {
  toggle = on;
  writeStorage(serializeExorcise(on));
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MotionState {
  return state;
}

export function useMotion(): MotionState & { setExorcise: (on: boolean) => void } {
  initMotion();
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, setExorcise };
}
