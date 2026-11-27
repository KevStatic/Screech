/**
 * Seance screech loop state machine. Pure: no clock, no random source, no timers.
 * Same shape as beacon-machine.ts, without a quiet state: a blocked audio context
 * or a missing wake lock never stops the loop.
 */
import { screechInterval } from './screech-schedule';

export type ScreechState =
  | { readonly kind: 'stopped' }
  | {
      readonly kind: 'running';
      readonly nextDueAt: number;
      readonly playing: boolean;
    };

export type ScreechEvent =
  | { readonly type: 'start'; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'visible'; readonly now: number }
  | { readonly type: 'screechStarted'; readonly now: number; readonly random: number }
  | { readonly type: 'screechSkipped'; readonly now: number; readonly random: number }
  | { readonly type: 'screechEnded'; readonly now: number }
  | { readonly type: 'contextFailed' }
  | { readonly type: 'stop' };

export type ScreechCommand = 'screech' | null;

export interface ScreechStep {
  readonly state: ScreechState;
  readonly command: ScreechCommand;
}

export const SCREECH_STOPPED: ScreechState = { kind: 'stopped' };

export function screechStep(state: ScreechState, event: ScreechEvent): ScreechStep {
  if (state.kind === 'stopped') {
    if (event.type === 'start') {
      // First screech is due at once.
      return {
        state: { kind: 'running', nextDueAt: event.now, playing: false },
        command: null,
      };
    }
    return { state, command: null };
  }

  switch (event.type) {
    case 'start':
      return { state, command: null };
    case 'stop':
      return { state: SCREECH_STOPPED, command: null };
    case 'tick':
    case 'visible': {
      // Never start a screech while one is playing.
      const due = !state.playing && event.now >= state.nextDueAt;
      return { state, command: due ? 'screech' : null };
    }
    case 'screechStarted':
      // Next due = start of this screech + a new interval (never previous due + interval).
      return {
        state: {
          ...state,
          playing: true,
          nextDueAt: event.now + screechInterval(event.random),
        },
        command: null,
      };
    case 'screechSkipped':
      return {
        state: {
          ...state,
          playing: false,
          nextDueAt: event.now + screechInterval(event.random),
        },
        command: null,
      };
    case 'screechEnded':
      return { state: { ...state, playing: false }, command: null };
    case 'contextFailed':
      // Audio blocked: nothing is playing, but the loop keeps running and retries when due.
      return { state: { ...state, playing: false }, command: null };
  }
}
