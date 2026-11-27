import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCheckin, exportCsv, rollingCode, validateTitle, windowNumber } from '@screech/core';
import type { CheckIn } from '@screech/core';
import { TRANSMIT_VOLUME } from '../../audio/constants';
import { loadEngine } from '../../audio/engine';
import { currentContext, ensureRunning, unlockAudio } from '../../audio/session';
import type { UnlockOutcome } from '../../audio/session';
import { playWaveform } from '../../audio/transmit';
import type { PlaybackHandle } from '../../audio/transmit';
import { createWakeController } from '../../audio/wake-lock';
import type { WakeController, WakeStatus } from '../../audio/wake-lock';
import { describeEncodeError } from '../../logic/byte-budget';
import { countdownSeconds } from '../../logic/beacon-schedule';
import { splitCandles } from '../../logic/candle-split';
import type { CandleSplit } from '../../logic/candle-split';
import {
  MSG_POLL_NO_SIGNAL,
  createErrorMessage,
  createSeance,
  endErrorMessage,
  pollHost,
  postEnd,
} from '../../logic/checkin-client';
import type { FetchLike, HostCheckIn } from '../../logic/checkin-client';
import { clockOffsetMs, correctedNowSeconds, parseDateHeader } from '../../logic/host-clock';
import { SCREECH_STOPPED, screechStep } from '../../logic/screech-machine';
import type { ScreechEvent, ScreechState } from '../../logic/screech-machine';
import { createHostRecordStore } from '../../logic/seance-storage';
import type { HostRecord, HostRecordStore, StorageLike } from '../../logic/seance-storage';
import { useHold } from './useHold';
import type { HoldApi } from './useHold';

/** Poll period (11.6). */
export const POLL_INTERVAL_MS = 2000;
/** Time the audio unlock may take after the start tap. */
export const UNLOCK_TIMEOUT_MS = 3000;
/** Time the context may take to be running before a screech. */
export const RUNNING_CHECK_MS = 1000;
/** How often the screech loop looks at the clock. */
export const TICK_MS = 250;

export const TITLE_MESSAGE = 'The title must be 1 to 60 characters.';
export const GONE_MESSAGE = 'That séance is gone. Start a new one.';
export const SILENT_MESSAGE = 'The laptop is silent. Tap here to wake the sound.';
export const WAKE_WARNING_MESSAGE = 'This laptop may sleep during the séance. Keep the screen awake.';
export const ENGINE_MESSAGE = 'The sound engine could not start. The next screech will try again.';
export const SECRET_MESSAGE = 'The séance key could not be read. Start a new séance.';
export const NO_ATTENDANCE_MESSAGE = 'No attendance has been received yet. Wait for the next update and try again.';

export type SeancePhase = 'form' | 'starting' | 'open' | 'ended';

type TimerHandle = ReturnType<typeof setTimeout>;

/** Everything the hook touches outside React. Replace any of it in tests. */
export interface SeanceHostDeps {
  readonly fetch: FetchLike;
  readonly unlockAudio: () => Promise<UnlockOutcome>;
  readonly ensureRunning: () => Promise<void>;
  readonly currentContext: () => AudioContext | null;
  readonly loadEngine: typeof loadEngine;
  readonly playWaveform: (ctx: AudioContext, wave: Float32Array) => PlaybackHandle;
  readonly wake: WakeController;
  readonly now: () => number;
  readonly random: () => number;
  readonly transmitVolume: number;
  readonly setTimeout: (fn: () => void, ms: number) => TimerHandle;
  readonly clearTimeout: (id: TimerHandle) => void;
  readonly setInterval: (fn: () => void, ms: number) => TimerHandle;
  readonly clearInterval: (id: TimerHandle) => void;
  /** Where the host record is kept. Pass null when sessionStorage is unavailable. */
  readonly session: StorageLike | null;
  readonly isVisible: () => boolean;
  /** Subscribes to tab visibility changes; returns an unsubscribe function. */
  readonly onVisibilityChange: (cb: () => void) => () => void;
  /** Saves a text file. Gets the full text, BOM included. */
  readonly saveFile: (filename: string, text: string) => void;
}

export interface SeanceHostView {
  readonly phase: SeancePhase;
  readonly title: string;
  readonly sessionId: string | null;
  /** Check-ins from the latest poll, or [] before any. */
  readonly checkIns: readonly HostCheckIn[];
  readonly candles: CandleSplit<HostCheckIn>;
  /** Soul_Count: the poll count while open, the final count once ended. */
  readonly soulCount: number;
  /** Message for the Start_Form (validation, create failure, "gone"), or null. */
  readonly startError: string | null;
  /** True when the open séance was resumed from sessionStorage. */
  readonly resumed: boolean;
  /** 11.8 message while polls are failing, else null. */
  readonly pollError: string | null;
  readonly screeching: boolean;
  readonly countdownSeconds: number;
  readonly wake: WakeStatus;
  /** True when the laptop may sleep (12.11). */
  readonly wakeWarning: boolean;
  /** True when the browser blocked audio (12.13). */
  readonly audioBlocked: boolean;
  readonly screechError: string | null;
  readonly endError: string | null;
  readonly ending: boolean;
  readonly downloadError: string | null;
  readonly endHold: HoldApi;
  /** Call from the Start button tap, with the typed Title. */
  readonly start: (title: string) => void;
  /** Call from the "silent laptop" tap. */
  readonly wakeSound: () => void;
  readonly download: () => void;
}

const NO_CHECKINS: readonly HostCheckIn[] = [];

function defaultSession(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function saveBlobFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function defaultDeps(): SeanceHostDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    unlockAudio,
    ensureRunning,
    currentContext,
    loadEngine,
    playWaveform,
    wake: createWakeController(),
    now: () => Date.now(),
    random: () => Math.random(),
    transmitVolume: TRANSMIT_VOLUME,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    session: defaultSession(),
    isVisible: () => document.visibilityState === 'visible',
    onVisibilityChange: (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    saveFile: saveBlobFile,
  };
}

/** Resolves with the value, or with `timedOut` once `ms` have passed. Never rejects. */
function race<T, F>(
  deps: Pick<SeanceHostDeps, 'setTimeout' | 'clearTimeout'>,
  promise: Promise<T>,
  ms: number,
  timedOut: F,
): Promise<T | F> {
  return new Promise<T | F>((resolve) => {
    const timer = deps.setTimeout(() => resolve(timedOut), ms);
    promise.then(
      (value) => {
        deps.clearTimeout(timer);
        resolve(value);
      },
      () => {
        deps.clearTimeout(timer);
        resolve(timedOut);
      },
    );
  });
}

/** Decodes base64url to bytes, or null when it is not valid base64url. */
function base64UrlToBytes(value: string): Uint8Array | null {
  if (value === '' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function useSeanceHost(injected?: Partial<SeanceHostDeps>): SeanceHostView {
  const depsRef = useRef<SeanceHostDeps | null>(null);
  if (depsRef.current === null) depsRef.current = { ...defaultDeps(), ...injected };
  const deps = depsRef.current;

  const storeRef = useRef<HostRecordStore | null>(null);
  if (storeRef.current === null) storeRef.current = createHostRecordStore(deps.session);
  const store = storeRef.current;

  // Resume from sessionStorage on first render (10.10).
  const [initial] = useState<HostRecord | null>(() => store.load());
  const [session, setSession] = useState<HostRecord | null>(initial);
  const [phase, setPhase] = useState<SeancePhase>(initial === null ? 'form' : 'open');
  const [resumed, setResumed] = useState(initial !== null);

  const [startError, setStartError] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<readonly HostCheckIn[]>(NO_CHECKINS);
  const [finalCount, setFinalCount] = useState<number | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [screeching, setScreeching] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [screechError, setScreechError] = useState<string | null>(null);
  const [wake, setWake] = useState<WakeStatus>('idle');
  const [endError, setEndError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => deps.now());
  const [screechState, setScreechState] = useState<ScreechState>(SCREECH_STOPPED);

  // Latest poll list; null until a poll response has arrived (4.9).
  const latestRef = useRef<readonly HostCheckIn[] | null>(null);
  const offsetRef = useRef(0);
  const startingRef = useRef(false);
  const endingRef = useRef(false);
  const resumedRef = useRef(initial !== null);
  const firstPollRef = useRef(initial !== null);
  const sessionRef = useRef<HostRecord | null>(initial);
  sessionRef.current = session;

  // Screech loop bookkeeping.
  const stateRef = useRef<ScreechState>(SCREECH_STOPPED);
  const busyRef = useRef(false);
  const runRef = useRef(0);
  const handleRef = useRef<PlaybackHandle | null>(null);

  const open = phase === 'open' && session !== null;

  const updateOffset = useCallback(
    (dateHeader: string | null): void => {
      const serverMs = parseDateHeader(dateHeader);
      if (serverMs !== null) offsetRef.current = clockOffsetMs(serverMs, deps.now());
    },
    [deps],
  );

  /** Back to the Start_Form: clears storage and everything the séance held. */
  const reset = useCallback(
    (message: string | null): void => {
      store.clear();
      latestRef.current = null;
      resumedRef.current = false;
      firstPollRef.current = false;
      setSession(null);
      setResumed(false);
      setCheckIns(NO_CHECKINS);
      setFinalCount(null);
      setPollError(null);
      setEndError(null);
      setDownloadError(null);
      setStartError(message);
      setPhase('form');
    },
    [store],
  );

  // ---- Create flow (10.3 to 10.9) -----------------------------------------

  const start = useCallback(
    (rawTitle: string): void => {
      if (startingRef.current || phase === 'open' || phase === 'starting') return;
      const checked = validateTitle(rawTitle);
      if (!checked.ok) {
        setStartError(TITLE_MESSAGE);
        return;
      }
      // Inside the tap: create or resume the AudioContext. No microphone request.
      const unlocking = deps.unlockAudio();
      void unlocking.catch(() => undefined);
      startingRef.current = true;
      setStartError(null);
      setPhase('starting');
      void (async () => {
        const result = await createSeance(deps.fetch, checked.value);
        startingRef.current = false;
        if (result.outcome.kind !== 'ok') {
          setStartError(createErrorMessage(result.outcome));
          setPhase('form');
          return;
        }
        const created = result.outcome.value;
        updateOffset(result.dateHeader);
        // Best effort: a failed unlock shows the silent-laptop message on the first screech.
        void race(deps, unlocking, UNLOCK_TIMEOUT_MS, null);
        const record: HostRecord = {
          sessionId: created.sessionId,
          title: created.title,
          hostSecret: created.hostSecret,
        };
        store.save(record);
        latestRef.current = null;
        resumedRef.current = false;
        firstPollRef.current = false;
        setCheckIns(NO_CHECKINS);
        setFinalCount(null);
        setPollError(null);
        setEndError(null);
        setDownloadError(null);
        setResumed(false);
        setSession(record);
        setPhase('open');
      })();
    },
    [deps, phase, store, updateOffset],
  );

  // ---- Poll_Loop (11.3, 11.5 to 11.9, 10.11) -------------------------------

  useEffect(() => {
    if (!open || session === null) return undefined;
    const { sessionId, hostSecret } = session;
    let alive = true;
    let inFlight = false;
    let timer: TimerHandle | null = null;

    const schedule = (delayMs: number): void => {
      if (timer !== null) deps.clearTimeout(timer);
      timer = deps.setTimeout(() => {
        timer = null;
        void poll();
      }, delayMs);
    };

    const poll = async (): Promise<void> => {
      if (!alive || inFlight) return;
      if (!deps.isVisible()) return; // resumed by the visibility handler
      inFlight = true;
      const startedAt = deps.now();
      const result = await pollHost(deps.fetch, sessionId, hostSecret);
      inFlight = false;
      if (!alive) return;
      const outcome = result.outcome;
      if (outcome.kind === 'ok') {
        firstPollRef.current = false;
        updateOffset(result.dateHeader);
        latestRef.current = outcome.value.checkIns;
        setCheckIns(outcome.value.checkIns);
        setPollError(null);
        if (!outcome.value.open) {
          // Ended from elsewhere: show the ended view.
          alive = false;
          store.clear();
          setFinalCount(outcome.value.checkIns.length);
          setPhase('ended');
          return;
        }
      } else if (outcome.kind === 'http-error' && outcome.status === 404) {
        alive = false;
        reset(GONE_MESSAGE);
        return;
      } else {
        firstPollRef.current = false;
        setPollError(MSG_POLL_NO_SIGNAL);
      }
      // Next poll 2 s after this one started, never before it finished.
      schedule(Math.max(0, POLL_INTERVAL_MS - (deps.now() - startedAt)));
    };

    const onVisible = (): void => {
      if (!deps.isVisible() || !alive || inFlight) return;
      schedule(0);
    };
    const unsubscribe = deps.onVisibilityChange(onVisible);
    void poll();

    return () => {
      alive = false;
      unsubscribe();
      if (timer !== null) deps.clearTimeout(timer);
    };
  }, [open, session, deps, store, reset, updateOffset]);

  // ---- Screech_Loop (12.1 to 12.4, 12.13, 12.15) ---------------------------

  const dispatch = useCallback((event: ScreechEvent): boolean => {
    const step = screechStep(stateRef.current, event);
    stateRef.current = step.state;
    setScreechState(step.state);
    return step.command === 'screech';
  }, []);

  const screech = useCallback(
    async (record: HostRecord): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      const run = runRef.current;
      const stale = (): boolean => run !== runRef.current;
      try {
        await race(deps, deps.ensureRunning(), RUNNING_CHECK_MS, undefined);
        if (stale()) return;
        const ctx = deps.currentContext();
        if (ctx === null || ctx.state !== 'running') {
          setAudioBlocked(true);
          dispatch({ type: 'contextFailed' });
          return;
        }

        const secret = base64UrlToBytes(record.hostSecret);
        if (secret === null) {
          setScreechError(SECRET_MESSAGE);
          dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
          return;
        }
        // A fresh packet each screech, from the corrected window's code (12.3).
        let code: string;
        try {
          code = await rollingCode(secret, windowNumber(correctedNowSeconds(offsetRef.current, deps.now())));
        } catch {
          setScreechError(SECRET_MESSAGE);
          dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
          return;
        }
        if (stale()) return;
        const built = buildCheckin({ sessionId: record.sessionId, code });
        if (!built.ok) {
          setScreechError(describeEncodeError(built.error));
          dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
          return;
        }

        // Read the rate now: the browser may have changed it since the last screech.
        const engine = await deps.loadEngine(ctx.sampleRate);
        if (stale()) return;
        if (!engine.ok) {
          setScreechError(ENGINE_MESSAGE);
          dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
          return;
        }
        let wave: Float32Array;
        try {
          wave = engine.engine.encode(built.value, { volume: deps.transmitVolume });
        } catch {
          setScreechError(ENGINE_MESSAGE);
          dispatch({ type: 'screechSkipped', now: deps.now(), random: deps.random() });
          return;
        }
        if (stale()) return;

        const handle = deps.playWaveform(ctx, wave);
        handleRef.current = handle;
        setScreechError(null);
        setAudioBlocked(false);
        setScreeching(true);
        dispatch({ type: 'screechStarted', now: deps.now(), random: deps.random() });
        const result = await handle.finished;
        if (handleRef.current === handle) handleRef.current = null;
        if (stale()) return;
        setScreeching(false);
        dispatch({ type: 'screechEnded', now: deps.now() });
        if (result === 'failed' && ctx.state !== 'running') {
          setAudioBlocked(true);
          dispatch({ type: 'contextFailed' });
        }
      } finally {
        // A stale run must not clear a newer run's guard.
        if (!stale()) busyRef.current = false;
      }
    },
    [deps, dispatch],
  );

  useEffect(() => {
    if (!open || session === null) return undefined;
    const record = session;
    runRef.current += 1;
    busyRef.current = false;
    const onCommand = (wanted: boolean): void => {
      if (wanted && !busyRef.current) void screech(record);
    };
    const first = deps.now();
    dispatch({ type: 'start', now: first });
    onCommand(dispatch({ type: 'tick', now: first }));
    const id = deps.setInterval(() => {
      const now = deps.now();
      setNowMs(now);
      onCommand(dispatch({ type: 'tick', now }));
    }, TICK_MS);
    const unsubscribe = deps.onVisibilityChange(() => {
      if (!deps.isVisible()) return;
      void (async () => {
        await deps.ensureRunning();
        if (stateRef.current.kind !== 'running') return;
        onCommand(dispatch({ type: 'visible', now: deps.now() }));
      })();
    });
    return () => {
      runRef.current += 1;
      unsubscribe();
      deps.clearInterval(id);
      stateRef.current = SCREECH_STOPPED;
      setScreechState(SCREECH_STOPPED);
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle !== null) handle.stop();
      busyRef.current = false;
      setScreeching(false);
    };
  }, [open, session, deps, dispatch, screech]);

  const wakeSound = useCallback((): void => {
    // First statement: the unlock must run inside the tap.
    const unlocking = deps.unlockAudio();
    void (async () => {
      const outcome = await race(deps, unlocking, UNLOCK_TIMEOUT_MS, null);
      if (outcome !== null && outcome.ok) setAudioBlocked(false);
    })();
  }, [deps]);

  // ---- Wake lock (12.9 to 12.11) -------------------------------------------

  useEffect(() => {
    if (!open) return undefined;
    const acquire = (): void => {
      void deps.wake.acquire().then((status) => setWake(status));
    };
    acquire();
    const offChange = deps.wake.onChange((status) => setWake(status));
    const offVisible = deps.onVisibilityChange(() => {
      if (deps.isVisible()) acquire();
    });
    return () => {
      offChange();
      offVisible();
      void deps.wake.release().then(() => setWake('idle'));
    };
  }, [open, deps]);

  // ---- End flow (12.5 to 12.8) ---------------------------------------------

  const end = useCallback(async (): Promise<void> => {
    const record = sessionRef.current;
    if (record === null || endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    setEndError(null);
    const result = await postEnd(deps.fetch, record.sessionId, record.hostSecret);
    endingRef.current = false;
    setEnding(false);
    if (result.outcome.kind !== 'ok') {
      // Loops keep running; the host can hold again.
      setEndError(endErrorMessage(result.outcome));
      return;
    }
    store.clear();
    setFinalCount(result.outcome.value.count);
    setPhase('ended'); // effects tear down the loops and the wake lock
  }, [deps, store]);

  const endHold = useHold({
    disabled: phase !== 'open' || ending,
    onFired: () => {
      void end();
    },
  });

  // ---- CSV download (4.8, 4.9) ---------------------------------------------

  const download = useCallback((): void => {
    const record = sessionRef.current;
    const latest = latestRef.current;
    if (record === null || latest === null) {
      setDownloadError(NO_ATTENDANCE_MESSAGE);
      return;
    }
    setDownloadError(null);
    const rows: CheckIn[] = latest.map((c) => ({ name: c.name, deviceId: '', at: c.at }));
    // UTF-8 byte order mark so spreadsheets read the accents.
    deps.saveFile(`seance-${record.sessionId}.csv`, `\uFEFF${exportCsv(rows)}`);
  }, [deps]);

  // Leaving the screen stops everything (12.14): the effects above clean up on unmount.
  // The record stays in sessionStorage so a reload resumes the séance.

  const running = screechState.kind === 'running';
  const countdown =
    screechState.kind === 'running' && !screechState.playing
      ? countdownSeconds(screechState.nextDueAt, nowMs)
      : 0;

  const shown = phase === 'ended' && latestRef.current !== null ? latestRef.current : checkIns;

  return {
    phase,
    title: session?.title ?? '',
    sessionId: session?.sessionId ?? null,
    checkIns: shown,
    candles: splitCandles(shown),
    soulCount: finalCount ?? shown.length,
    startError,
    resumed,
    pollError,
    screeching,
    countdownSeconds: running ? countdown : 0,
    wake,
    wakeWarning: open && (wake === 'unsupported' || wake === 'rejected'),
    audioBlocked,
    screechError,
    endError,
    ending,
    downloadError,
    endHold,
    start,
    wakeSound,
    download,
  };
}
