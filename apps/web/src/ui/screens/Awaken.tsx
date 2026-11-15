import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { readCapabilities } from '../../audio/env';
import { MIC_BLOCKED_MESSAGE, openMic, stopStream } from '../../audio/mic';
import { MAX_MIC_ATTEMPTS, micStatusForFailure } from '../../logic/flow';
import { micSupport, missingFeatures, type Env } from '../../logic/capabilities';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import type { AudioSessionApi } from '../hooks/useAudioSession';
import type { FlowApi } from '../hooks/useFlow';

export const MSG_UNLOCK_FAILED = 'Audio could not start. Tap to try again.';
export const MSG_INSECURE = 'The spirits need HTTPS to hear you.';
export const MSG_NO_GETUSERMEDIA = 'This browser has no microphone access.';
export const MSG_SETTINGS =
  'To allow the microphone: open your browser settings, find this site, set Microphone to Allow, then reload the page.';

export interface AwakenProps {
  readonly flow: FlowApi;
  readonly audio: Pick<AudioSessionApi, 'unlockAudio'>;
  /** Browser capabilities. Read once from window and navigator when omitted. */
  readonly env?: Env;
}

function okWord(ok: boolean): string {
  return ok ? 'OK' : 'MISSING';
}

/** Screen 1: boot lines, the Awaken control, mic and unlock messages, Exorcise toggle. */
export default function Awaken({ flow, audio, env }: AwakenProps): ReactElement {
  const capabilities = useMemo<Env>(() => env ?? readCapabilities(), [env]);
  const { state, dispatch } = flow;
  const [busy, setBusy] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const missing = missingFeatures(capabilities);
  const support = micSupport(capabilities);

  // The first request counts as attempt 1 (4.7: at most 3 per page load).
  const attemptsUsed = state.micAttempts + 1;
  const canRetryMic = attemptsUsed < MAX_MIC_ATTEMPTS;
  const denied = state.mic === 'denied';
  const micBlocked = state.mic === 'blocked';
  const blocked =
    micBlocked || state.mic === 'insecure-context' || state.mic === 'no-getusermedia';

  function awaken(isMicRetry: boolean): void {
    // unlockAudio() must run synchronously in the tap, before anything else and before any await.
    const unlocking = audio.unlockAudio();
    if (busy) return;
    setBusy(true);
    setUnlockFailed(false);
    setMicMessage(null);
    if (isMicRetry) dispatch({ type: 'retryMic' });
    void run(unlocking);
  }

  async function run(unlocking: ReturnType<AudioSessionApi['unlockAudio']>): Promise<void> {
    try {
      const outcome = await unlocking;
      if (!mounted.current) return;
      if (!outcome.ok) {
        setUnlockFailed(true);
        return;
      }
      dispatch({ type: 'unlocked' });
      if (support === 'insecure-context') {
        dispatch({ type: 'micResult', status: 'insecure-context' });
        return;
      }
      if (support === 'no-getusermedia') {
        dispatch({ type: 'micResult', status: 'no-getusermedia' });
        return;
      }
      const mic = await openMic();
      if (!mounted.current) {
        if (mic.ok) stopStream(mic.stream);
        return;
      }
      if (!mic.ok) {
        setMicMessage(mic.message);
        dispatch({ type: 'micResult', status: micStatusForFailure(mic.reason) });
        return;
      }
      // The permission is all Awaken needs. Close the mic at once.
      stopStream(mic.stream);
      dispatch({ type: 'micResult', status: 'granted' });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const bootLines: readonly string[] = [
    'SCREECH v1.0 . BOOTING',
    `WEBASSEMBLY ......... ${okWord(capabilities.hasWasm)}`,
    `WEB AUDIO ........... ${okWord(capabilities.hasWebAudio)}`,
    `SECURE CONTEXT ...... ${okWord(capabilities.isSecureContext)}`,
    `MIC API ............. ${okWord(capabilities.hasGetUserMedia)}`,
    'SPIRIT BAND 1875 Hz .. OPEN',
  ];

  const showAwakenControl = !denied && !blocked;

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="awaken-title">
        <div className="row">
          <span className="label grow">Screen: Awaken</span>
          <ExorciseToggle />
        </div>

        <div className="col" style={{ alignItems: 'center' }}>
          <h1 id="awaken-title" className="title fx-boot-title" style={{ fontSize: 56 }}>
            SCREECH
          </h1>
          <p className="note">a spirit box for your data</p>
        </div>

        <div className="col" style={{ gap: 2 }} aria-label="Boot log" role="log">
          {bootLines.map((line, i) => (
            <div
              key={line}
              className="fx-boot wrap"
              style={{ animationDelay: `${(i * 0.3).toFixed(1)}s`, whiteSpace: 'pre-wrap' }}
            >
              {'> '}
              {line}
            </div>
          ))}
        </div>

        {missing.length > 0 ? (
          <p className="note is-error panel" role="alert">
            This browser lacks: {missing.join(', ')}. Screech may not work here.
          </p>
        ) : null}

        {unlockFailed ? (
          <p className="note is-error panel" role="alert">
            {MSG_UNLOCK_FAILED}
          </p>
        ) : null}

        {state.mic === 'insecure-context' ? (
          <p className="note is-error panel" role="alert">
            {MSG_INSECURE} This page is not on a secure connection (HTTPS), so the microphone is
            blocked.
          </p>
        ) : null}

        {state.mic === 'no-getusermedia' ? (
          <p className="note is-error panel" role="alert">
            {MSG_NO_GETUSERMEDIA} Microphone capture is not supported here.
          </p>
        ) : null}

        {micBlocked ? (
          <p className="note is-error panel" role="alert">
            {MIC_BLOCKED_MESSAGE}
          </p>
        ) : null}

        {denied ? (
          <div className="note is-error panel col" role="alert">
            <span>
              {micMessage ??
                'The microphone was refused. Screech cannot hear without it.'}
            </span>
            {!canRetryMic ? (
              <span>Too many tries. {MSG_SETTINGS}</span>
            ) : (
              <span>{MSG_SETTINGS}</span>
            )}
          </div>
        ) : null}

        <div className="col" style={{ marginTop: 'auto' }}>
          {showAwakenControl ? (
            <button
              type="button"
              className="btn hit fx-pulse"
              style={{ minHeight: 64, fontSize: 32, letterSpacing: 6 }}
              disabled={busy}
              onClick={() => awaken(false)}
            >
              {busy ? 'WAKING' : unlockFailed ? 'TRY AGAIN' : 'AWAKEN'}
            </button>
          ) : null}

          {denied && canRetryMic ? (
            <button
              type="button"
              className="btn hit"
              disabled={busy}
              onClick={() => awaken(true)}
            >
              Ask for the microphone again ({MAX_MIC_ATTEMPTS - attemptsUsed} left)
            </button>
          ) : null}

          {denied || blocked ? (
            <button
              type="button"
              className="btn secondary hit"
              disabled={busy}
              onClick={() => dispatch({ type: 'continueWithoutListening' })}
            >
              Continue without listening
            </button>
          ) : null}

          <p className="note" style={{ textAlign: 'center' }}>
            The spirits need to hear you. Awakening asks for your microphone.
          </p>
          <p className="muted" style={{ textAlign: 'center' }}>
            Exorcise turns off flicker and motion.
          </p>
        </div>
      </main>
    </CrtFrame>
  );
}
