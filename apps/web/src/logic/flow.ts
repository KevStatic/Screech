import { MIC_BLOCKED_MESSAGE, type MicFailureReason } from './mic-messages';
import type { ScreenState } from './screen-state';

export type Screen = 'awaken' | 'speak' | 'screeching' | 'listen' | 'reveal' | 'garbled' | 'sealed';
export type MicStatus =
  | 'unprobed'
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'insecure-context'
  | 'no-getusermedia'
  | 'skipped';

export interface FlowState {
  readonly screen: Screen;
  readonly mic: MicStatus;
  readonly transmitting: boolean;
  readonly listening: boolean;
  /** Plain-words message (15.6, 15.7). */
  readonly notice: string | null;
  /** Mic retry taps used, capped at MAX_MIC_ATTEMPTS (4.7). */
  readonly micAttempts: number;
  /** Hold fired while the context was not running; the wake control is shown. */
  readonly wakePending: boolean;
  readonly received: Extract<ScreenState, { kind: 'reveal' }> | null;
}

export type FlowEvent =
  | { readonly type: 'unlocked' }
  | { readonly type: 'micResult'; readonly status: MicStatus }
  | { readonly type: 'continueWithoutListening' }
  | { readonly type: 'retryMic' }
  | { readonly type: 'openListen' }
  | { readonly type: 'leaveListen' }
  | { readonly type: 'holdFired'; readonly contextRunning: boolean }
  | { readonly type: 'wakeTapped' }
  | { readonly type: 'startTransmit' }
  | { readonly type: 'transmitEnded' }
  | { readonly type: 'received'; readonly state: ScreenState }
  | { readonly type: 'back'; readonly target: 'speak' | 'listen' }
  | { readonly type: 'inputEdited' }
  | { readonly type: 'cardSelected' };

export const MAX_MIC_ATTEMPTS = 3;
export const NOTICE_LISTEN_BLOCKED = 'Listening is unavailable until the transmission ends.';
export const NOTICE_SEND_BLOCKED = 'Sending is unavailable while listening.';

export const INITIAL_FLOW_STATE: FlowState = {
  screen: 'awaken',
  mic: 'unprobed',
  transmitting: false,
  listening: false,
  notice: null,
  micAttempts: 0,
  wakePending: false,
  received: null,
};

export function canTransmit(state: FlowState): boolean {
  return !state.listening && !state.transmitting;
}

export function canListen(state: FlowState): boolean {
  return state.mic === 'granted' && !state.transmitting;
}

/** Why Listen cannot open because of the mic, or null when the mic is not the cause. */
export function listenUnavailableReason(state: FlowState): string | null {
  return state.mic === 'blocked' ? MIC_BLOCKED_MESSAGE : null;
}

/** Maps a failed mic request to the flow status. 'unavailable' is treated as denied. */
export function micStatusForFailure(reason: MicFailureReason): MicStatus {
  return reason === 'blocked' ? 'blocked' : 'denied';
}

function startTransmit(state: FlowState): FlowState {
  if (state.listening) return { ...state, wakePending: false, notice: NOTICE_SEND_BLOCKED };
  if (state.transmitting) return { ...state, wakePending: false };
  return {
    ...state,
    screen: 'screeching',
    transmitting: true,
    wakePending: false,
    notice: null,
  };
}

function openListen(state: FlowState): FlowState {
  if (state.transmitting) return { ...state, wakePending: false, notice: NOTICE_LISTEN_BLOCKED };
  if (!canListen(state) || state.screen !== 'speak') return { ...state, wakePending: false };
  return { ...state, screen: 'listen', listening: true, wakePending: false, notice: null };
}

function leaveToSpeak(state: FlowState): FlowState {
  return { ...state, screen: 'speak', listening: false, received: null, notice: null };
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'unlocked':
      return state.screen === 'awaken' ? { ...state, notice: null } : state;

    case 'micResult':
      if (state.screen !== 'awaken') return state;
      if (event.status === 'granted') {
        return { ...state, mic: 'granted', screen: 'speak', notice: null };
      }
      return { ...state, mic: event.status, notice: null };

    case 'continueWithoutListening':
      if (state.screen !== 'awaken' || state.mic === 'granted') return state;
      return { ...state, mic: 'skipped', screen: 'speak', notice: null };

    case 'retryMic':
      if (state.screen !== 'awaken' || state.mic === 'granted') return state;
      if (state.micAttempts >= MAX_MIC_ATTEMPTS) return state;
      return { ...state, mic: 'unprobed', micAttempts: state.micAttempts + 1, notice: null };

    case 'openListen':
      return openListen(state);

    case 'leaveListen':
      return state.screen === 'listen' ? leaveToSpeak(state) : state;

    case 'holdFired':
      if (state.screen !== 'speak') return state;
      if (event.contextRunning) return startTransmit(state);
      if (state.listening) return { ...state, notice: NOTICE_SEND_BLOCKED };
      return { ...state, wakePending: true };

    case 'wakeTapped':
      if (state.screen !== 'speak') return state;
      return startTransmit(state);

    case 'startTransmit':
      if (state.screen !== 'speak' && !state.listening) return state;
      return startTransmit(state);

    case 'transmitEnded':
      if (!state.transmitting) return state;
      return {
        ...state,
        transmitting: false,
        screen: state.screen === 'screeching' ? 'speak' : state.screen,
        notice: null,
      };

    case 'received': {
      const s = event.state;
      if (s.kind === 'ignore') return state;
      const base = { ...state, listening: false, notice: null };
      if (s.kind === 'reveal') return { ...base, screen: 'reveal', received: s };
      if (s.kind === 'garbled') return { ...base, screen: 'garbled', received: null };
      return { ...base, screen: 'sealed', received: null };
    }

    case 'back':
      if (event.target === 'speak') {
        return state.screen === 'awaken' || state.screen === 'screeching' ? state : leaveToSpeak(state);
      }
      if (state.screen !== 'reveal' && state.screen !== 'garbled' && state.screen !== 'sealed') {
        return state;
      }
      if (!canListen(state)) return leaveToSpeak(state);
      return { ...state, screen: 'listen', listening: true, received: null, notice: null };

    case 'inputEdited':
    case 'cardSelected':
      return state.wakePending ? { ...state, wakePending: false } : state;
  }
}
