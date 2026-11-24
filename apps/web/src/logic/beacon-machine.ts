/** Beacon timing state machine. Pure: no clock, no random source, no timers. */
import { beaconInterval } from './beacon-schedule';

export type BeaconState =
  | { readonly kind: 'stopped' }
  | {
      readonly kind: 'running';
      readonly nextDueAt: number;
      readonly playing: boolean;
      readonly quiet: boolean;
    };

export type BeaconEvent =
  | { readonly type: 'start'; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'visible'; readonly now: number }
  | { readonly type: 'screechStarted'; readonly now: number; readonly random: number }
  | { readonly type: 'screechSkipped'; readonly now: number; readonly random: number }
  | { readonly type: 'screechEnded'; readonly now: number }
  | { readonly type: 'contextFailed' }
  | { readonly type: 'wakeSucceeded'; readonly now: number }
  | { readonly type: 'stop' };

export type BeaconCommand = 'screech' | null;

export interface BeaconStep {
  readonly state: BeaconState;
  readonly command: BeaconCommand;
}

export const BEACON_STOPPED: BeaconState = { kind: 'stopped' };

export function beaconStep(state: BeaconState, event: BeaconEvent): BeaconStep {
  if (state.kind === 'stopped') {
    if (event.type === 'start') {
      // First screech is due at once.
      return {
        state: { kind: 'running', nextDueAt: event.now, playing: false, quiet: false },
        command: null,
      };
    }
    return { state, command: null };
  }

  switch (event.type) {
    case 'start':
      return { state, command: null };
    case 'stop':
      return { state: BEACON_STOPPED, command: null };
    case 'tick':
    case 'visible': {
      const due = !state.playing && !state.quiet && event.now >= state.nextDueAt;
      return { state, command: due ? 'screech' : null };
    }
    case 'screechStarted':
      // Next due = start of this screech + a new interval (never previous due + interval).
      return {
        state: {
          ...state,
          playing: true,
          nextDueAt: event.now + beaconInterval(event.random),
        },
        command: null,
      };
    case 'screechSkipped':
      return {
        state: {
          ...state,
          playing: false,
          nextDueAt: event.now + beaconInterval(event.random),
        },
        command: null,
      };
    case 'screechEnded':
      return { state: { ...state, playing: false }, command: null };
    case 'contextFailed':
      return { state: { ...state, playing: false, quiet: true }, command: null };
    case 'wakeSucceeded':
      if (!state.quiet) return { state, command: null };
      return { state: { ...state, quiet: false }, command: 'screech' };
  }
}
