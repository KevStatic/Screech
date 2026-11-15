import { useCallback, useMemo, useReducer, type Dispatch } from 'react';
import {
  INITIAL_FLOW_STATE,
  flowReducer,
  type FlowEvent,
  type FlowState,
} from '../../logic/flow';

export interface FlowApi {
  readonly state: FlowState;
  readonly dispatch: Dispatch<FlowEvent>;
  /** Hold fired. `contextRunning` comes from isRunning(), read synchronously. */
  readonly holdFired: (contextRunning: boolean) => void;
  /** The wake control was tapped and unlockAudio() succeeded. */
  readonly wakeTapped: () => void;
}

/** Thin React wrapper around the pure flow reducer. */
export function useFlow(): FlowApi {
  const [state, dispatch] = useReducer(flowReducer, INITIAL_FLOW_STATE);
  const holdFired = useCallback(
    (contextRunning: boolean): void => dispatch({ type: 'holdFired', contextRunning }),
    [],
  );
  const wakeTapped = useCallback((): void => dispatch({ type: 'wakeTapped' }), []);
  return useMemo(
    () => ({ state, dispatch, holdFired, wakeTapped }),
    [state, holdFired, wakeTapped],
  );
}
