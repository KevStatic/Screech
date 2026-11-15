import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startCapture, type CaptureHandle, type CaptureHandlers } from '../../audio/capture';
import { loadEngine, type EngineResult, ENGINE_FAILURE_MESSAGE } from '../../audio/engine';
import { openMic, stopStream } from '../../audio/mic';
import {
  currentContext,
  ensureRunning,
  isRunning,
  unlockAudio,
  type UnlockOutcome,
} from '../../audio/session';

export const LISTENING_STOPPED_MESSAGE = 'Listening stopped.';

/** A capture is stale when no audio block arrived for this long. */
const STALE_BLOCK_MS = 1000;

export type ListenStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'listening' }
  /** Resume or restart failed. The UI shows a tap control wired to retryListening(). */
  | { readonly kind: 'retry'; readonly message: string };

export type StartListeningResult =
  | { readonly ok: true; readonly handle: CaptureHandle }
  | { readonly ok: false; readonly message: string };

export interface AudioSessionApi {
  readonly unlockAudio: () => Promise<UnlockOutcome>;
  readonly ensureRunning: () => Promise<void>;
  readonly isRunning: () => boolean;
  /** The current AudioContext, or null before the first unlock. Never creates one. */
  readonly context: () => AudioContext | null;
  /** Loads ggwave for the current context's sample rate. */
  readonly getEngine: () => Promise<EngineResult>;
  readonly listenStatus: ListenStatus;
  /** The live capture handle (analyser, lastBlockAt), or null. */
  readonly captureHandle: () => CaptureHandle | null;
  /** Starts capture on a stream the caller opened inside its own tap handler. */
  readonly startListening: (
    stream: MediaStream,
    handlers: CaptureHandlers,
  ) => Promise<StartListeningResult>;
  readonly stopListening: () => void;
  /** Click handler for the retry tap: unlockAudio() first, then a fresh mic and capture. */
  readonly retryListening: () => Promise<StartListeningResult>;
}

interface ListenSession {
  stream: MediaStream;
  handlers: CaptureHandlers;
  handle: CaptureHandle;
}

function tracksLive(stream: MediaStream): boolean {
  const tracks = stream.getAudioTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === 'live');
}

/** Owns the context, engine and capture handle for the screens. */
export function useAudioSession(): AudioSessionApi {
  const [listenStatus, setListenStatus] = useState<ListenStatus>({ kind: 'idle' });
  const session = useRef<ListenSession | null>(null);
  /** Handlers of the last listen session, kept so a retry can reuse them. */
  const lastHandlers = useRef<CaptureHandlers | null>(null);
  /** True while the Listen screen wants capture running. */
  const wantListening = useRef(false);

  const getEngine = useCallback(async (): Promise<EngineResult> => {
    const ctx = currentContext();
    if (ctx === null) return { ok: false, message: ENGINE_FAILURE_MESSAGE };
    return loadEngine(ctx.sampleRate);
  }, []);

  const teardown = useCallback((): void => {
    const s = session.current;
    session.current = null;
    if (s !== null) {
      s.handle.stop();
      stopStream(s.stream);
    }
  }, []);

  const begin = useCallback(
    async (stream: MediaStream, handlers: CaptureHandlers): Promise<StartListeningResult> => {
      const ctx = currentContext();
      if (ctx === null) {
        stopStream(stream);
        return { ok: false, message: LISTENING_STOPPED_MESSAGE };
      }
      const engine = await loadEngine(ctx.sampleRate);
      if (!engine.ok) {
        stopStream(stream);
        return { ok: false, message: engine.message };
      }
      teardown();
      const wrapped: CaptureHandlers = {
        onPacketBytes: handlers.onPacketBytes,
        onMicLost: handlers.onMicLost,
      };
      const result = await startCapture(ctx, stream, (s) => engine.engine.decode(s), wrapped);
      if (!result.ok) {
        stopStream(stream);
        return { ok: false, message: result.message };
      }
      session.current = { stream, handlers: wrapped, handle: result.handle };
      lastHandlers.current = wrapped;
      wantListening.current = true;
      setListenStatus({ kind: 'listening' });
      return { ok: true, handle: result.handle };
    },
    [teardown],
  );

  const startListening = useCallback(
    (stream: MediaStream, handlers: CaptureHandlers): Promise<StartListeningResult> =>
      begin(stream, handlers),
    [begin],
  );

  const stopListening = useCallback((): void => {
    wantListening.current = false;
    teardown();
    setListenStatus({ kind: 'idle' });
  }, [teardown]);

  const retryListening = useCallback((): Promise<StartListeningResult> => {
    // Called inside the click: unlockAudio() runs before anything is awaited.
    const unlocking = unlockAudio();
    return (async (): Promise<StartListeningResult> => {
      const handlers = lastHandlers.current;
      const fail = (): StartListeningResult => {
        setListenStatus({ kind: 'retry', message: LISTENING_STOPPED_MESSAGE });
        return { ok: false, message: LISTENING_STOPPED_MESSAGE };
      };
      const outcome = await unlocking;
      if (!outcome.ok || handlers === null) return fail();
      teardown();
      const mic = await openMic();
      if (!mic.ok) {
        setListenStatus({ kind: 'retry', message: mic.message });
        return { ok: false, message: mic.message };
      }
      const started = await begin(mic.stream, handlers);
      if (!started.ok) setListenStatus({ kind: 'retry', message: started.message });
      return started;
    })();
  }, [begin, teardown]);

  // Tab visibility: resume the context and restart capture if it went stale.
  useEffect(() => {
    let cancelled = false;

    const onVisible = async (): Promise<void> => {
      const ctx = currentContext();
      if (ctx === null || ctx.state === 'closed') return;
      if (!wantListening.current) {
        // Speak (or idle): same semantics as every other Speak handler.
        void ensureRunning();
        return;
      }
      try {
        await ctx.resume();
      } catch {
        if (!cancelled) setListenStatus({ kind: 'retry', message: LISTENING_STOPPED_MESSAGE });
        return;
      }
      if (cancelled || !wantListening.current) return;
      if (ctx.state !== 'running') {
        setListenStatus({ kind: 'retry', message: LISTENING_STOPPED_MESSAGE });
        return;
      }
      const s = session.current;
      const stale =
        s === null ||
        !tracksLive(s.stream) ||
        performance.now() - s.handle.lastBlockAt() > STALE_BLOCK_MS;
      if (!stale || s === null) {
        if (s !== null) setListenStatus({ kind: 'listening' });
        return;
      }
      // Stopping the old capture also stops its tracks, so a fresh stream is needed.
      const handlers = s.handlers;
      teardown();
      const mic = await openMic();
      if (cancelled || !wantListening.current) {
        if (mic.ok) stopStream(mic.stream);
        return;
      }
      if (!mic.ok) {
        setListenStatus({ kind: 'retry', message: LISTENING_STOPPED_MESSAGE });
        return;
      }
      const restarted = await begin(mic.stream, handlers);
      if (!restarted.ok && !cancelled) {
        setListenStatus({ kind: 'retry', message: LISTENING_STOPPED_MESSAGE });
      }
    };

    const listener = (): void => {
      if (document.visibilityState === 'visible') void onVisible();
    };
    document.addEventListener('visibilitychange', listener);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', listener);
    };
  }, [begin, teardown]);

  // Release the mic when the owner unmounts.
  useEffect(
    () => () => {
      wantListening.current = false;
      teardown();
    },
    [teardown],
  );

  const captureHandle = useCallback((): CaptureHandle | null => session.current?.handle ?? null, []);
  const context = useCallback((): AudioContext | null => currentContext(), []);

  return useMemo(
    () => ({
      unlockAudio,
      ensureRunning,
      isRunning,
      context,
      getEngine,
      listenStatus,
      captureHandle,
      startListening,
      stopListening,
      retryListening,
    }),
    [context, getEngine, listenStatus, captureHandle, startListening, stopListening, retryListening],
  );
}
