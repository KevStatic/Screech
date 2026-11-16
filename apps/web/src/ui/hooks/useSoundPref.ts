import { useSyncExternalStore } from 'react';
import { SOUND_KEY, parseSound, serializeSound } from '../../logic/sound-pref';

export interface SoundPrefState {
  /** Saved Sound toggle (in-memory copy; storage may be unavailable). */
  readonly on: boolean;
}

let state: SoundPrefState = { on: true };
let initialised = false;
const listeners = new Set<() => void>();

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(SOUND_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    window.localStorage.setItem(SOUND_KEY, value);
  } catch {
    // Storage unavailable: the in-memory value still applies.
  }
}

function publish(on: boolean): void {
  if (state.on === on) return;
  state = { on };
  listeners.forEach((l) => l());
}

/** Read the saved value once. Never writes. Safe to call repeatedly. */
export function initSound(): void {
  if (initialised) return;
  initialised = true;
  publish(parseSound(readStorage()));
}

/** Update memory, notify listeners, then try to persist. */
export function setSound(on: boolean): void {
  initialised = true;
  publish(on);
  writeStorage(serializeSound(on));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SoundPrefState {
  return state;
}

/** Non-React access for other stores (the sound hint). */
export function getSoundOn(): boolean {
  initSound();
  return state.on;
}

export const subscribeSoundPref = subscribe;

export function useSoundPref(): SoundPrefState & { setSound: (on: boolean) => void } {
  initSound();
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, setSound };
}
