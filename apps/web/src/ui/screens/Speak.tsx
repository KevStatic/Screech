import { useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { encode, type WifiSecurity } from '@screech/core';
import { loadEngine } from '../../audio/engine';
import { playWaveform, type PlaybackHandle } from '../../audio/transmit';
import { budget, type Budget } from '../../logic/byte-budget';
import { canListen, canTransmit, listenUnavailableReason } from '../../logic/flow';
import { buildPayload, hasContent, type Draft, type TypeKey } from '../../logic/payload-draft';
import ByteCandle from '../components/ByteCandle';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import ModeSwitch from '../components/ModeSwitch';
import ScreechKey from '../components/ScreechKey';
import TarotCard from '../components/TarotCard';
import type { AudioSessionApi } from '../hooks/useAudioSession';
import type { DraftApi } from '../hooks/useDraft';
import type { FlowApi } from '../hooks/useFlow';
import { useHold } from '../hooks/useHold';
export const MSG_NOTHING_WRITTEN = 'Nothing written yet. Write something to send.';
export const MSG_WAKE_SLEEPING = 'The box fell asleep. Tap to wake it.';
export const MSG_WAKE_FAILED = 'Audio could not start. Tap to try again.';
export const MSG_SEAL_LATER = 'Sealed messages arrive in a later release.';
export const MSG_LISTEN_NO_MIC = 'Listening is off. The microphone is not available.';
export const WAKE_LABEL = 'Tap to wake the box';
/** What startTransmission() hands to the Screeching screen. */
export type TransmissionOutcome =
  | {
      readonly ok: true;
      readonly handle: PlaybackHandle;
      readonly sampleRate: number;
      /** The waveform that was handed to playWaveform, for the oscilloscope. */
      readonly wave: Float32Array;
      /** Short text of what is being sent, for the letters swallowed on Screeching. */
      readonly message?: string;
    }
  /** The engine could not start, so nothing was played. Screeching shows its error state. */
  | { readonly ok: false; readonly message: string };
export interface SpeakProps {
  readonly flow: FlowApi;
  readonly audio: Pick<AudioSessionApi, 'unlockAudio' | 'ensureRunning' | 'isRunning' | 'context'>;
  readonly draft: DraftApi;
  /** Called just before the flow moves to Screeching. */
  readonly onTransmission: (outcome: TransmissionOutcome) => void;
}
interface CardInfo {
  readonly key: TypeKey;
  readonly numeral: string;
  readonly title: string;
  readonly kind: string;
  readonly icon: ReactNode;
}
function Icon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
const CARDS: readonly CardInfo[] = [
  {
    key: 'text',
    numeral: 'I',
    title: 'Whisper',
    kind: 'text',
    icon: (
      <Icon>
        <path d="M4 6h16M4 11h16M4 16h10" />
      </Icon>
    ),
  },
  {
    key: 'url',
    numeral: 'II',
    title: 'Portal',
    kind: 'link',
    icon: (
      <Icon>
        <path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z" />
        <path d="M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z" />
        <path d="M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z" />
      </Icon>
    ),
  },
  {
    key: 'wifi',
    numeral: 'III',
    title: 'Ether',
    kind: 'wi-fi',
    icon: (
      <Icon>
        <path d="M2.5 9a14 14 0 0 1 19 0" />
        <path d="M6 12.5a9 9 0 0 1 12 0" />
        <path d="M9.5 16a4 4 0 0 1 5 0" />
        <path d="M12 19.5h0.01" />
      </Icon>
    ),
  },
  {
    key: 'contact',
    numeral: 'IV',
    title: 'Summon',
    kind: 'contact',
    icon: (
      <Icon>
        <path d="M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </Icon>
    ),
  },
];
const SECURITY_OPTIONS: readonly { readonly value: WifiSecurity; readonly label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'wpa', label: 'WPA' },
  { value: 'wep', label: 'WEP' },
];

/** The words that are swallowed by the speaker while the sound plays. */
function spokenText(draft: Draft): string {
  switch (draft.selected) {
    case 'text':
      return draft.text;
    case 'url':
      return draft.url;
    case 'wifi':
      return draft.wifi.ssid;
    case 'contact':
      return draft.contact.name || draft.contact.email || draft.contact.phone;
  }
}
/** What the byte candle and SCREECH key show for the current draft. */
interface Reading {
  readonly budget: Budget;
  /** Plain-words reason the key is off that ByteCandle does not render itself. */
  readonly message: string | null;
  readonly sendable: boolean;
}
const EMPTY_BUDGET: Budget = { status: 'ok', size: 0, fill: 0, message: null };
function read(draft: Draft): Reading {
  if (!hasContent(draft)) {
    return { budget: EMPTY_BUDGET, message: MSG_NOTHING_WRITTEN, sendable: false };
  }
  const built = buildPayload(draft);
  if (!built.ok) {
    return {
      budget: { status: 'invalid', size: null, fill: 0, message: built.message },
      message: built.message,
      sendable: false,
    };
  }
  const result = budget(encode(built.payload));
  // ByteCandle renders the too-large message itself. Every other failure is shown here.
  const message = result.status === 'invalid' ? result.message : null;
  return { budget: result, message, sendable: result.status === 'ok' };
}
/** Screen 2: choose a card, write the message, hold SCREECH. */
export default function Speak({ flow, audio, draft: draftApi, onTransmission }: SpeakProps): ReactElement {
  const { state, dispatch } = flow;
  const { draft, update } = draftApi;
  const [wakeBusy, setWakeBusy] = useState(false);
  const [wakeFailed, setWakeFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sending = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const reading = useMemo(() => read(draft), [draft]);
  const canSend = reading.sendable && canTransmit(state);
  /** Keep-alive for every gesture handler. First call, synchronous, never awaited. */
  const keepAlive = (): void => {
    void audio.ensureRunning();
  };
  const gesture = { onClick: keepAlive, onKeyDown: keepAlive };
  /** Plain async function. It needs no gesture because it only plays on a running context. */
  async function startTransmission(ctx: AudioContext): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    setNotice(null);
    try {
      const engine = await loadEngine(ctx.sampleRate);
      const built = buildPayload(draftRef.current);
      if (!built.ok) {
        setNotice(built.message);
        return;
      }
      const packet = encode(built.payload);
      const size = budget(packet);
      if (!packet.ok || size.status !== 'ok') {
        setNotice(size.message ?? 'The box could not prepare this message.');
        return;
      }
      if (!engine.ok) {
        onTransmission({ ok: false, message: engine.message });
        dispatch({ type: 'startTransmit' });
        return;
      }
      let waveform: Float32Array;
      try {
        waveform = engine.engine.encode(packet.value);
      } catch {
        onTransmission({ ok: false, message: 'The sound engine could not start.' });
        dispatch({ type: 'startTransmit' });
        return;
      }
      const handle = playWaveform(ctx, waveform);
      onTransmission({
        ok: true,
        handle,
        sampleRate: ctx.sampleRate,
        wave: waveform,
        message: spokenText(draftRef.current),
      });
      dispatch({ type: 'startTransmit' });
    } finally {
      sending.current = false;
    }
  }
  const hold = useHold({
    disabled: !canSend,
    onFired: (contextRunning) => {
      // Timer context: no gesture. Never unlock or resume from here.
      if (contextRunning) {
        const ctx = audio.context();
        if (ctx !== null) void startTransmission(ctx);
        return;
      }
      flow.holdFired(false);
    },
  });
  function wake(): void {
    // First statement, nothing awaited before it: this is the user activation.
    const unlocking = audio.unlockAudio();
    if (wakeBusy) return;
    setWakeBusy(true);
    setWakeFailed(false);
    void (async () => {
      try {
        const outcome = await unlocking;
        if (!outcome.ok) {
          setWakeFailed(true);
          return;
        }
        flow.wakeTapped();
        await startTransmission(outcome.ctx);
      } finally {
        setWakeBusy(false);
      }
    })();
  }
  /** Called by the mode switch, which runs keepAlive first. */
  function openListen(): void {
    const unlocking = audio.unlockAudio();
    void unlocking.then((outcome) => {
      if (outcome.ok) {
        setNotice(null);
        dispatch({ type: 'openListen' });
      } else {
        setNotice(MSG_WAKE_FAILED);
      }
    });
  }
  function select(key: TypeKey): void {
    keepAlive();
    update((d) => ({ ...d, selected: key }));
    dispatch({ type: 'cardSelected' });
  }
  function edit(change: (d: Draft) => Draft): void {
    update(change);
    dispatch({ type: 'inputEdited' });
  }
  const onText = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    const text = e.target.value;
    edit((d) => ({ ...d, text }));
  };
  const onUrl = (e: ChangeEvent<HTMLInputElement>): void => {
    const url = e.target.value;
    edit((d) => ({ ...d, url }));
  };
  const onWifi =
    (field: 'ssid' | 'password') =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const value = e.target.value;
      edit((d) => ({ ...d, wifi: { ...d.wifi, [field]: value } }));
    };
  const onSecurity = (e: ChangeEvent<HTMLSelectElement>): void => {
    const security = e.target.value as WifiSecurity;
    edit((d) => ({ ...d, wifi: { ...d.wifi, security } }));
  };
  const onContact =
    (field: 'name' | 'phone' | 'email') =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const value = e.target.value;
      edit((d) => ({ ...d, contact: { ...d.contact, [field]: value } }));
    };
  const listenEnabled = canListen(state);
  const listenReason = listenEnabled ? null : (listenUnavailableReason(state) ?? MSG_LISTEN_NO_MIC);
  const shownNotice = state.notice ?? notice;
  return (
    <CrtFrame>
      <main className="screen screen-tight" aria-labelledby="speak-title">
        <span className="sr-only">Screen: Speak</span>
        <ModeSwitch
          current="speak"
          onListen={openListen}
          listenDisabled={!listenEnabled}
          onGesture={keepAlive}
        />
        {listenReason !== null ? <span className="muted">{listenReason}</span> : null}
        <div className="row">
          <h1 id="speak-title" className="note grow" style={{ margin: 0 }}>
            Draw a card. Choose what crosses over.
          </h1>
          <ExorciseToggle />
        </div>
        <div
          role="group"
          aria-label="Message type"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}
          onKeyDown={keepAlive}
        >
          {CARDS.map((card) => (
            <TarotCard
              key={card.key}
              numeral={card.numeral}
              title={card.title}
              kind={card.kind}
              icon={card.icon}
              selected={draft.selected === card.key}
              onSelect={() => select(card.key)}
            />
          ))}
        </div>
        <div className="col">
          {draft.selected === 'text' ? (
            <>
              <label htmlFor="speak-text" className="label">
                Your whisper
              </label>
              <textarea
                id="speak-text"
                className="field"
                rows={3}
                value={draft.text}
                onChange={onText}
                {...gesture}
              />
            </>
          ) : null}
          {draft.selected === 'url' ? (
            <>
              <label htmlFor="speak-url" className="label">
                Portal address
              </label>
              <input
                id="speak-url"
                className="field"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={draft.url}
                onChange={onUrl}
                {...gesture}
              />
              <span className="muted">Known realms like meet.google.com/ shrink to one byte.</span>
            </>
          ) : null}
          {draft.selected === 'wifi' ? (
            <>
              <label htmlFor="speak-ssid" className="label">
                Network name
              </label>
              <input
                id="speak-ssid"
                className="field"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={draft.wifi.ssid}
                onChange={onWifi('ssid')}
                {...gesture}
              />
              <label htmlFor="speak-password" className="label">
                Password
              </label>
              <input
                id="speak-password"
                className="field"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={draft.wifi.password}
                onChange={onWifi('password')}
                {...gesture}
              />
              <label htmlFor="speak-security" className="label">
                Security
              </label>
              <select
                id="speak-security"
                className="field"
                value={draft.wifi.security}
                onChange={onSecurity}
                {...gesture}
              >
                {SECURITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {draft.selected === 'contact' ? (
            <>
              <label htmlFor="speak-name" className="label">
                Name
              </label>
              <input
                id="speak-name"
                className="field"
                type="text"
                autoComplete="off"
                value={draft.contact.name}
                onChange={onContact('name')}
                {...gesture}
              />
              <label htmlFor="speak-phone" className="label">
                Phone
              </label>
              <input
                id="speak-phone"
                className="field"
                type="tel"
                autoComplete="off"
                value={draft.contact.phone}
                onChange={onContact('phone')}
                {...gesture}
              />
              <label htmlFor="speak-email" className="label">
                Email
              </label>
              <input
                id="speak-email"
                className="field"
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                value={draft.contact.email}
                onChange={onContact('email')}
                {...gesture}
              />
            </>
          ) : null}
        </div>
        <ByteCandle budget={reading.budget}>
          <button
            type="button"
            className="seal-toggle hit is-seal"
            aria-disabled="true"
            aria-pressed="false"
            aria-describedby="speak-seal-note"
            {...gesture}
          >
            Seal this message
          </button>
          <span id="speak-seal-note" className="muted">
            {MSG_SEAL_LATER}
          </span>
        </ByteCandle>
        {reading.message !== null ? (
          <p
            className={`note${reading.budget.status === 'invalid' ? ' is-error' : ''}`}
            role={reading.budget.status === 'invalid' ? 'alert' : 'status'}
          >
            {reading.message}
          </p>
        ) : null}
        {state.wakePending ? (
          <div className="panel col" role="alert">
            <p className="note">{MSG_WAKE_SLEEPING}</p>
            <button
              type="button"
              className="btn hit"
              style={{ minHeight: 56 }}
              data-testid="wake-control"
              onClick={wake}
            >
              {WAKE_LABEL}
            </button>
            {wakeFailed ? (
              <p className="note is-error" role="alert">
                {MSG_WAKE_FAILED}
              </p>
            ) : null}
          </div>
        ) : null}
        {shownNotice !== null ? (
          <p className="note is-error" role="alert">
            {shownNotice}
          </p>
        ) : null}
        <div className="col" style={{ marginTop: 'auto' }}>
          <ScreechKey hold={hold} disabled={!canSend} />
        </div>
      </main>
    </CrtFrame>
  );
}
