import { useEffect, useRef, useState, type ReactElement } from 'react';
import { decode } from '@screech/core';
import type { CaptureHandle } from '../../audio/capture';
import { openMic } from '../../audio/mic';
import { dedupeStep, type DedupeState } from '../../logic/dedupe';
import { NOTICE_SEND_BLOCKED } from '../../logic/flow';
import { screenState } from '../../logic/screen-state';
import CrtFrame from '../components/CrtFrame';
import ToggleCluster from '../components/ToggleCluster';
import ModeSwitch from '../components/ModeSwitch';
import KIIMeter from '../components/KIIMeter';
import Spectrogram from '../components/Spectrogram';
import type { AudioSessionApi } from '../hooks/useAudioSession';
import type { FlowApi } from '../hooks/useFlow';
import { useMotion } from '../hooks/useMotion';

export const LABEL_LISTENING = 'Listening';
export const LABEL_BAND = '1.9 kHz to 6.4 kHz';
export const LABEL_BACK = 'Back to Speak';
export const LABEL_START = 'Start listening';
export const LABEL_RETRY = 'Tap to listen again';
export const MSG_MIC_SILENT = 'The microphone went silent. Nothing can be heard right now.';
export const MSG_LISTENING_STOPPED = 'Listening stopped. Tap to listen again.';
export const MSG_AUDIO_FAILED = 'Audio could not start. Tap to try again.';

export interface ListenProps {
  readonly flow: Pick<FlowApi, 'state' | 'dispatch'>;
  readonly audio: Pick<
    AudioSessionApi,
    | 'unlockAudio'
    | 'context'
    | 'listenStatus'
    | 'startListening'
    | 'stopListening'
    | 'captureHandle'
  >;
  /** Clock for the 5 second duplicate window. */
  readonly now?: () => number;
}

/** Last time each result was shown. Lives outside the component so it survives Reveal and back. */
let shown: DedupeState = new Map();

export function resetListenDedupe(): void {
  shown = new Map();
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

type Phase =
  | { readonly kind: 'ready' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'listening'; readonly handle: CaptureHandle; readonly sampleRate: number }
  | { readonly kind: 'silent'; readonly message: string };

/** Screen 4: show the room's sound and wait for a Screech. Plays no sound. */
export default function Listen({ flow, audio, now = () => Date.now() }: ListenProps): ReactElement {
  const { dispatch, state } = flow;
  const { reduced } = useMotion();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const mounted = useRef(true);
  const latest = useRef({ dispatch, audio, now });
  latest.current = { dispatch, audio, now };

  function onPacketBytes(bytes: Uint8Array): void {
    const { dispatch: send, audio: a, now: clock } = latest.current;
    const result = decode(bytes);
    const screen = screenState(result);
    // ignore: nothing visible, no state change, no log.
    if (screen.kind === 'ignore') return;
    const key = screen.kind === 'reveal' ? toHex(bytes) : screen.kind;
    const step = dedupeStep(shown, key, clock());
    if (!step.show) return;
    shown = step.state;
    a.stopListening();
    send({ type: 'received', state: screen });
  }

  function onMicLost(): void {
    if (!mounted.current) return;
    latest.current.audio.stopListening();
    setPhase({ kind: 'silent', message: MSG_MIC_SILENT });
  }

  /** `unlocking` comes from unlockAudio(), which the caller already invoked inside its click. */
  async function begin(unlocking: ReturnType<AudioSessionApi['unlockAudio']>): Promise<void> {
    setPhase({ kind: 'starting' });
    const outcome = await unlocking;
    if (!mounted.current) return;
    if (!outcome.ok) {
      setPhase({ kind: 'silent', message: MSG_AUDIO_FAILED });
      return;
    }
    const mic = await openMic();
    if (!mounted.current) {
      if (mic.ok) for (const t of mic.stream.getTracks()) t.stop();
      return;
    }
    if (!mic.ok) {
      setPhase({ kind: 'silent', message: mic.message });
      return;
    }
    const started = await latest.current.audio.startListening(mic.stream, { onPacketBytes, onMicLost });
    if (!mounted.current) {
      latest.current.audio.stopListening();
      return;
    }
    if (!started.ok) {
      setPhase({ kind: 'silent', message: started.message });
      return;
    }
    setPhase({ kind: 'listening', handle: started.handle, sampleRate: outcome.sampleRate });
  }

  // The mic opens only from a tap on this screen (start or retry), never on mount.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latest.current.audio.stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry(): void {
    // First statement, nothing awaited before it: this is the user activation.
    const unlocking = audio.unlockAudio();
    void begin(unlocking);
  }

  function back(): void {
    audio.stopListening();
    dispatch({ type: 'leaveListen' });
  }

  // A failed resume or restart after the tab came back arrives through the hook.
  const hookRetry = audio.listenStatus.kind === 'retry' ? audio.listenStatus.message : null;
  const retryMessage =
    phase.kind === 'silent' ? phase.message : phase.kind === 'listening' ? hookRetry : null;
  const live = phase.kind === 'listening' && retryMessage === null ? phase : null;
  const sendNotice = state.notice ?? NOTICE_SEND_BLOCKED;

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="listen-title">
        <ModeSwitch current="listen" onSpeak={back} />
        <div className="row">
          <span className="label grow">Screen: Listen</span>
          <ToggleCluster />
        </div>
        <h1 id="listen-title" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          {retryMessage !== null ? 'THE BOX WENT QUIET' : LABEL_LISTENING}
        </h1>
        {live !== null ? (
          <p className="label signal" role="status" data-testid="listen-label">
            {LABEL_LISTENING}
          </p>
        ) : null}
        <p className="muted" data-testid="listen-band">
          Screech band: {LABEL_BAND}
        </p>
        {phase.kind === 'ready' ? (
          <button type="button" className="btn hit" data-testid="listen-start" onClick={retry}>
            {LABEL_START}
          </button>
        ) : null}
        {phase.kind === 'starting' ? (
          <p className="muted" role="status">
            Opening the microphone.
          </p>
        ) : null}
        {live !== null ? (
          <>
            <Spectrogram analyser={live.handle.analyser} sampleRate={live.sampleRate} reducedMotion={reduced} />
            <KIIMeter analyser={live.handle.analyser} sampleRate={live.sampleRate} reducedMotion={reduced} />
          </>
        ) : null}
        {retryMessage !== null ? (
          <div className="panel col is-error" role="alert" data-testid="listen-silent">
            <p className="note is-error">{retryMessage}</p>
            <button type="button" className="btn hit" data-testid="listen-retry" onClick={retry}>
              {LABEL_RETRY}
            </button>
          </div>
        ) : null}
        <p className="muted" data-testid="listen-send-notice">
          {sendNotice}
        </p>
      </main>
    </CrtFrame>
  );
}
