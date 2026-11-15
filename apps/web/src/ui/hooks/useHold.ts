import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, MouseEvent } from 'react';
import { ensureRunning, isRunning } from '../../audio/session';
import { holdProgress, holdStep, type HoldEvent, type HoldState } from '../../logic/hold-machine';

/** Hold timer period. */
export const HOLD_TICK_MS = 33;

export interface UseHoldOptions {
  /** When true the key dispatches nothing and the machine resets to idle. */
  readonly disabled: boolean;
  /** Called once per hold, on the transition into `fired`, with the synchronous isRunning() value. */
  readonly onFired: (contextRunning: boolean) => void;
}

export interface HoldHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface HoldApi {
  readonly state: HoldState;
  /** Fill level, 0..1. */
  readonly progress: number;
  readonly handlers: HoldHandlers;
}

const IDLE: HoldState = { kind: 'idle' };

function isHoldKey(key: string): boolean {
  return key === ' ' || key === 'Enter' || key === 'Spacebar';
}

/**
 * Press-and-hold gesture. The timer only advances the machine and reports the fire.
 * It never calls unlockAudio() or resume(); the press-side handlers call ensureRunning().
 */
export function useHold(options: UseHoldOptions): HoldApi {
  const { disabled, onFired } = options;
  const [state, setState] = useState<HoldState>(IDLE);
  const stateRef = useRef<HoldState>(IDLE);
  const pressedAt = useRef(0);
  const onFiredRef = useRef(onFired);
  const disabledRef = useRef(disabled);
  onFiredRef.current = onFired;
  disabledRef.current = disabled;

  const dispatch = useCallback((event: HoldEvent): void => {
    const prev = stateRef.current;
    const next = holdStep(prev, event);
    if (next === prev) return;
    if (prev.kind === 'idle' && next.kind === 'holding') pressedAt.current = performance.now();
    stateRef.current = next;
    setState(next);
    if (prev.kind !== 'fired' && next.kind === 'fired') {
      onFiredRef.current(isRunning());
    }
  }, []);

  // Disabled: dispatch nothing and fall back to idle.
  useEffect(() => {
    if (disabled && stateRef.current.kind !== 'idle') {
      stateRef.current = IDLE;
      setState(IDLE);
    }
  }, [disabled]);

  // Timer: only while holding.
  const holding = state.kind === 'holding';
  useEffect(() => {
    if (!holding) return undefined;
    const id = window.setInterval(() => {
      dispatch({ kind: 'tick', elapsedMs: performance.now() - pressedAt.current });
    }, HOLD_TICK_MS);
    return () => window.clearInterval(id);
  }, [holding, dispatch]);

  const press = useCallback((): void => {
    if (disabledRef.current) return;
    dispatch({ kind: 'press' });
  }, [dispatch]);

  const release = useCallback((): void => {
    if (disabledRef.current) return;
    dispatch({ kind: 'release' });
  }, [dispatch]);

  const cancel = useCallback((): void => {
    if (disabledRef.current) return;
    dispatch({ kind: 'cancel' });
  }, [dispatch]);

  const handlers = useMemo<HoldHandlers>(
    () => ({
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        press();
      },
      onPointerUp: () => {
        void ensureRunning();
        release();
      },
      onPointerLeave: () => cancel(),
      onPointerCancel: () => cancel(),
      onClick: () => {
        void ensureRunning();
      },
      onKeyDown: (event) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        if (event.repeat) return; // auto-repeat is dropped
        void ensureRunning();
        press();
      },
      onKeyUp: (event) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        release();
      },
    }),
    [press, release, cancel],
  );

  return useMemo(
    () => ({ state, progress: holdProgress(state), handlers }),
    [state, handlers],
  );
}
