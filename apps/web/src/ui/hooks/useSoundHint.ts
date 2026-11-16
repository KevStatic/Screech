import { useSyncExternalStore } from 'react';
import {
  SOUND_HINT_KEY,
  isIosDevice,
  serializeHintSeen,
  shouldShowSoundHint,
} from '../../logic/sound-hint';
import { getSoundOn, subscribeSoundPref } from './useSoundPref';

export interface SoundHintState {
  readonly visible: boolean;
  readonly dismiss: () => void;
}

export interface SoundHintDeps {
  /** Raw value under `key`, null when missing. May throw. */
  readonly readStorage: (key: string) => string | null;
  /** May throw. */
  readonly writeStorage: (key: string, value: string) => void;
  /** May throw. */
  readonly detectIos: () => boolean;
  readonly soundOn: () => boolean;
}

export interface SoundHintStore {
  markAwakenTapped(): void;
  /** Call when anything the decision depends on may have changed (Sound toggle, screen). */
  refresh(): void;
  dismiss(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): SoundHintState;
}

export function createSoundHintStore(deps: SoundHintDeps): SoundHintStore {
  let awakened = false;
  let latched = false;
  let dismissed = false;
  let ios: boolean | null = null;
  let savedValue: string | null | undefined;
  const listeners = new Set<() => void>();

  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    evaluate();
  };

  let snapshot: SoundHintState = { visible: false, dismiss };

  function safeSoundOn(): boolean {
    try {
      return deps.soundOn();
    } catch {
      return true;
    }
  }

  function evaluate(): void {
    if (!latched && awakened) {
      if (ios === null) {
        try {
          ios = deps.detectIos();
        } catch {
          ios = false;
        }
      }
      if (savedValue === undefined) {
        try {
          savedValue = deps.readStorage(SOUND_HINT_KEY);
        } catch {
          savedValue = null;
        }
      }
      const show = shouldShowSoundHint({
        soundOn: safeSoundOn(),
        ios,
        awakened,
        savedValue,
      });
      if (show) {
        latched = true;
        try {
          deps.writeStorage(SOUND_HINT_KEY, serializeHintSeen());
        } catch {
          // Storage unavailable: the latch still limits the hint to once per session.
        }
      }
    }
    const visible = latched && !dismissed && safeSoundOn();
    if (visible !== snapshot.visible) {
      snapshot = { visible, dismiss };
      listeners.forEach((l) => l());
    }
  }

  return {
    markAwakenTapped(): void {
      awakened = true;
      evaluate();
    },
    refresh: evaluate,
    dismiss,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

function detectRealIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

const store = createSoundHintStore({
  readStorage: (key) => window.localStorage.getItem(key),
  writeStorage: (key, value) => window.localStorage.setItem(key, value),
  detectIos: detectRealIos,
  soundOn: getSoundOn,
});

let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  subscribeSoundPref(() => store.refresh());
}

/** Called by the Awaken screen after the tap, whatever the unlock outcome. */
export function markAwakenTapped(): void {
  wire();
  store.markAwakenTapped();
}

export function useSoundHint(): SoundHintState {
  wire();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
