/** How long the Screech key must be held before it fires. */
export const HOLD_DURATION_MS = 300;

export type HoldState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'holding'; readonly elapsedMs: number }
  | { readonly kind: 'fired' };

export type HoldEvent =
  | { readonly kind: 'press' }
  | { readonly kind: 'release' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'tick'; readonly elapsedMs: number }; // elapsed since the press

const IDLE: HoldState = { kind: 'idle' };
const FIRED: HoldState = { kind: 'fired' };

/** Pure transition function for the press-and-hold gesture. */
export function holdStep(state: HoldState, event: HoldEvent): HoldState {
  switch (state.kind) {
    case 'idle':
      return event.kind === 'press' ? { kind: 'holding', elapsedMs: 0 } : IDLE;
    case 'holding':
      switch (event.kind) {
        case 'press':
          return state; // keyboard auto-repeat is ignored
        case 'release':
        case 'cancel':
          return IDLE;
        case 'tick':
          return event.elapsedMs >= HOLD_DURATION_MS
            ? FIRED
            : { kind: 'holding', elapsedMs: Math.max(state.elapsedMs, Math.max(0, event.elapsedMs)) };
      }
      return state;
    case 'fired':
      return event.kind === 'release' || event.kind === 'cancel' ? IDLE : FIRED;
  }
}

/** Fill level of the key, 0..1. */
export function holdProgress(state: HoldState): number {
  switch (state.kind) {
    case 'idle':
      return 0;
    case 'holding':
      return Math.min(1, state.elapsedMs / HOLD_DURATION_MS);
    case 'fired':
      return 1;
  }
}
