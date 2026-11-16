import { useLayoutEffect, useSyncExternalStore } from 'react';
import { hauntPlayer, onHauntFailure, type PlayOptions } from '../../audio/haunt-player';
import type { UnlockOutcome } from '../../audio/session';
import { quietState } from '../../logic/haunt-rules';
import type { OneShotName } from '../../logic/haunt-synth';
import type { AudioSessionApi } from './useAudioSession';
import type { FlowApi } from './useFlow';
import { useSoundPref } from './useSoundPref';

/**
 * Pushes Quiet_State and the Sound toggle into the player. A layout effect
 * so the gate is updated before the browser paints a screen change.
 */
export function useHauntBridge(
  flow: Pick<FlowApi, 'state'>,
  audio: Pick<AudioSessionApi, 'listenStatus'>,
): void {
  const { on } = useSoundPref();
  const quiet = quietState({
    screen: flow.state.screen,
    captureActive: audio.listenStatus.kind === 'listening',
    playbackRunning: flow.state.transmitting,
  });
  useLayoutEffect(() => {
    hauntPlayer.update({ quiet, soundOn: on });
  }, [quiet, on]);
}

export interface HauntTriggers {
  noteAwakenTap(outcome: UnlockOutcome): void;
  play(name: OneShotName, options?: PlayOptions): void;
  setDroneWanted(wanted: boolean): void;
  stopOneShots(): void;
  stopKind(name: OneShotName): void;
}

const triggers: HauntTriggers = {
  noteAwakenTap: (outcome) => hauntPlayer.noteAwakenTap(outcome),
  play: (name, options) => {
    hauntPlayer.play(name, options);
  },
  setDroneWanted: (wanted) => hauntPlayer.setDroneWanted(wanted),
  stopOneShots: () => hauntPlayer.stopOneShots(),
  stopKind: (name) => hauntPlayer.stopKind(name),
};

/** Stable trigger API for screens. Never re-renders. */
export function useHaunt(): HauntTriggers {
  return triggers;
}

/* Failure notice: set by the player's first failure, kept for the session. */

let failureNotice: string | null = null;
const noticeListeners = new Set<() => void>();
let attached = false;

function attach(): void {
  if (attached) return;
  attached = true;
  onHauntFailure((message) => {
    if (failureNotice !== null) return;
    failureNotice = message;
    noticeListeners.forEach((l) => l());
  });
}

// Attach at import so a failure before the notice mounts is not lost.
attach();

function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

function getNotice(): string | null {
  return failureNotice;
}

/** The failure notice text, or null until a sound first fails. */
export function useHauntFailureNotice(): string | null {
  return useSyncExternalStore(subscribeNotice, getNotice, getNotice);
}
