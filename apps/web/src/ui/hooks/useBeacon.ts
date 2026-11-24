import { useCallback, useEffect, useRef, useState } from 'react';
import { buildClue } from '@screech/core';
import type { ClueFields } from '@screech/core';
import { TRANSMIT_VOLUME } from '../../audio/constants';
import { loadEngine } from '../../audio/engine';
import { currentContext, ensureRunning, unlockAudio } from '../../audio/session';
import type { UnlockOutcome } from '../../audio/session';
import { playWaveform } from '../../audio/transmit';
import type { PlaybackHandle } from '../../audio/transmit';
import { createWakeController } from '../../audio/wake-lock';
import type { WakeController, WakeStatus } from '../../audio/wake-lock';
import { countdownSeconds } from '../../logic/beacon-schedule';
import { BEACON_STOPPED, beaconStep } from '../../logic/beacon-machine';
import type { BeaconEvent, BeaconState } from '../../logic/beacon-machine';
import { describeEncodeError } from '../../logic/byte-budget';

/** Time the audio unlock may take after the start tap (7.6). */
export const UNLOCK_TIMEOUT_MS = 3000;
/** Time the context may take to be running before a screech (9.6). */
export const RUNNING_CHECK_MS = 1000;
/** How often the loop looks at the clock. */
export const TICK_MS = 250;

export const UNLOCK_FAILED_MESSAGE = 'Audio could not start. Tap to try again.';
export const QUIET_MESSAGE = 'The beacon went quiet.';
export const ENGINE_MESSAGE = 'The sound engine could not start. The next screech will try again.';

export type BeaconPhase = 'idle' | 'starting' | 'running';

/** Everything the hook touches outside React. Replace any of it in tests. */
export interface BeaconDeps {
  readonly unlockAudio: () => Promise<UnlockOutcome>;
  readonly ensureRunning: () => Promise<void>;
  readonly currentContext: () => AudioContext | null;
  readonly loadEngine: typeof loadEngine;
  readonly playWaveform: (ctx: AudioContext, wave: Float32Array) => PlaybackHandle;
  readonly wake: WakeController;
  readonly now: () => number;
  readonly random: () => number;
  readonly transmitVolume: number;
}

export interface BeaconView {
  readonly phase: BeaconPhase;
  readonly countdownSeconds: number;
  readonly screeching: boolean;
  readonly wake: WakeStatus;
  readonly quiet: boolean;
  readonly error: string | null;
  /** Call from the start tap. */
  readonly start: () => void;
  /** Cuts a playing screech, cancels the loop, releases the wake lock. */
  readonly stop: () => void;
  /** Call from the "Tap to wake the beacon" tap. */
  readonly wakeTap: () => void;
}

function defaultDeps(): BeaconDeps {
  return {
    unlockAudio,
    ensureRunning,
    currentContext,
    loadEngine,
    playWaveform,
    wake: createWakeController(),
    now: () => Date.now(),
    random: () => Math.random(),
    transmitVolume: TRANSMIT_VOLUME,
  };
}

/** Resolves with the value, or with `timedOut` once `ms` have passed. Never rejects. */
function race<T, F>(promise: Promise<T>, ms: number, timedOut: F): Promise<T | F> {
  return new Promise<T | F>((resolve) => {
    const timer = setTimeout(() => resolve(timedOut), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(timedOut);
      },
    );
  });
}

export function useBeacon(fields: ClueFields, injected?: Partial<BeaconDeps>): BeaconView {
  const depsRef = useRef<BeaconDeps | null>(null);
  if (depsRef.current === null) depsRef.current = { ...defaultDeps(), ...injected };
  const deps = depsRef.current;

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const stateRef = useRef<BeaconState>(BEACON_STOPPED);
  const [state, setState] = useState<BeaconState>(BEACON_STOPPED);
  const [starting, setStarting] = useState(false);
  const [screeching, setScreeching] = useState(false);
  const [wake, setWake] = useState<WakeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => deps.now());

  // True while a screech is being set up or is playing. tick can return 'screech'
  // again until screechStarted or screechSkipped is dispatched, so extra commands are dropped.
  const busyRef = useRef(false);
  // Bumped by stop so an in-flight setup notices and bails out.
  const runRef = useRef(0);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const startingRef = useRef(false);

  const dispatch = useCallback((event: BeaconEvent): boolean => {
    const step = beaconStep(stateRef.current, event);
    stateRef.current = step.state;
    setState(step.state);
    return step.command === 'screech';
  }, []);

  const screech = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    const run = runRef.current;
    const stale = (): boolean => run !== runRef.current;
    try {
      await race(deps.ensureRunning(), RUNNING_CHECK_MS, undefined);
      if (stale()) return;
      const ctx = deps.currentContext();
      if (ctx === null || ctx.state !== 'running') {
        setError(QUIET_MESSAGE);
        dispatch({ type: 'contextFailed' });
        return;
      }

      const built = buildClue(fieldsRef.current);
      if (!built.ok) {
        setError(describeEncodeError(built.error));
        dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
        return;
      }

      // Read the rate now: the browser may have changed it since the last screech.
      const engine = await deps.loadEngine(ctx.sampleRate);
      if (stale()) return;
      if (!engine.ok) {
        setError(ENGINE_MESSAGE);
        dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
        return;
      }

      let wave: Float32Array;
      try {
        wave = engine.engine.encode(built.value, { volume: deps.transmitVolume });
      } catch {
        setError(ENGINE_MESSAGE);
        dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
        return;
      }
      if (stale()) return;

      const handle = deps.playWaveform(ctx, wave);
      handleRef.current = handle;
      setError(null);
      setScreeching(true);
      dispatch({ type: 'screechStarted', now: deps.now(), random: deps.random() });
      const result = await handle.finished;
      if (handleRef.current === handle) handleRef.current = null;
      if (stale()) return;
      setScreeching(false);
      dispatch({ type: 'screechEnded', now: deps.now() });
      if (result === 'failed' && ctx.state !== 'running') {
        setError(QUIET_MESSAGE);
        dispatch({ type: 'contextFailed' });
      }
    } finally {
      // stop() already cleared the guard; a stale run must not clear a newer run's guard.
      if (!stale()) busyRef.current = false;
    }
  }, [deps, dispatch]);

  const handleCommand = useCallback(
    (wanted: boolean): void => {
      // Ignore repeated commands while a screech setup or playback is in flight.
      if (wanted && !busyRef.current) void screech();
    },
    [screech],
  );

  const start = useCallback((): void => {
    // First statement: the unlock must run inside the tap.
    const unlocking = deps.unlockAudio();
    if (startingRef.current || stateRef.current.kind === 'running') return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    void (async () => {
      const outcome = await race(unlocking, UNLOCK_TIMEOUT_MS, null);
      startingRef.current = false;
      setStarting(false);
      if (outcome === null || !outcome.ok) {
        setError(UNLOCK_FAILED_MESSAGE);
        return;
      }
      const now = deps.now();
      runRef.current += 1;
      dispatch({ type: 'start', now });
      // The first screech is due at once.
      handleCommand(dispatch({ type: 'tick', now }));
      void deps.wake.acquire().then((status) => setWake(status));
    })();
  }, [deps, dispatch, handleCommand]);

  const stop = useCallback((): void => {
    runRef.current += 1;
    dispatch({ type: 'stop' });
    const handle = handleRef.current;
    handleRef.current = null;
    if (handle !== null) handle.stop();
    busyRef.current = false;
    setScreeching(false);
    setError(null);
    void deps.wake.release().then(() => setWake('idle'));
  }, [deps, dispatch]);

  const wakeTap = useCallback((): void => {
    // First statement: the unlock must run inside the tap.
    const unlocking = deps.unlockAudio();
    void (async () => {
      const outcome = await race(unlocking, UNLOCK_TIMEOUT_MS, null);
      if (outcome === null || !outcome.ok) {
        setError(UNLOCK_FAILED_MESSAGE);
        return;
      }
      setError(null);
      handleCommand(dispatch({ type: 'wakeSucceeded', now: deps.now() }));
    })();
  }, [deps, dispatch, handleCommand]);

  const running = state.kind === 'running';

  // The loop: read the clock every 250 ms.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const now = deps.now();
      setNowMs(now);
      handleCommand(dispatch({ type: 'tick', now }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, deps, dispatch, handleCommand]);

  // Coming back to the page: wake the context, re-request the wake lock, maybe screech once.
  useEffect(() => {
    if (!running) return undefined;
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        await deps.ensureRunning();
        if (stateRef.current.kind !== 'running') return;
        handleCommand(dispatch({ type: 'visible', now: deps.now() }));
        void deps.wake.acquire().then((status) => setWake(status));
      })();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [running, deps, dispatch, handleCommand]);

  // The browser can drop the wake lock on its own.
  useEffect(() => deps.wake.onChange((status) => setWake(status)), [deps]);

  // Leaving the screen stops everything.
  useEffect(
    () => () => {
      runRef.current += 1;
      stateRef.current = BEACON_STOPPED;
      handleRef.current?.stop();
      handleRef.current = null;
      void deps.wake.release();
    },
    [deps],
  );

  const phase: BeaconPhase = running ? 'running' : starting ? 'starting' : 'idle';
  const countdown =
    state.kind === 'running' && !state.playing && !state.quiet
      ? countdownSeconds(state.nextDueAt, nowMs)
      : 0;

  return {
    phase,
    countdownSeconds: countdown,
    screeching,
    wake,
    quiet: state.kind === 'running' && state.quiet,
    error,
    start,
    stop,
    wakeTap,
  };
}
