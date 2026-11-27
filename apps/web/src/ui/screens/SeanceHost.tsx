import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { HOLD_DURATION_MS } from '../../logic/hold-machine';
import CandleCircle from '../components/CandleCircle';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import { SILENT_MESSAGE, WAKE_WARNING_MESSAGE, useSeanceHost } from '../hooks/useSeanceHost';
import type { SeanceHostView } from '../hooks/useSeanceHost';

export const MSG_KEEP_OPEN =
  'Keep this tab open. If you close it, you lose control of the séance and cannot end it.';
export const LABEL_START = 'Start the séance';
export const LABEL_STARTING = 'Opening...';
export const LABEL_DOWNLOAD = 'Download attendance (CSV)';
export const TEXT_ENDED = 'The séance has ended';
export const TEXT_SCREECHING = 'SCREECHING';

/** "1 soul present" or "N souls present". */
export function soulsText(count: number): string {
  return count === 1 ? '1 soul present' : `${count} souls present`;
}

export interface SeanceHostProps {
  /** Leaves the screen (dispatches closeSeanceHost). The hook stops its loops on unmount. */
  readonly onLeave: () => void;
}

function StartForm({ host, onLeave }: { host: SeanceHostView; onLeave: () => void }): ReactElement {
  const [title, setTitle] = useState('');
  const fieldId = useId();
  const starting = host.phase === 'starting';
  return (
    <main className="screen" aria-labelledby="seance-start-title">
      <div className="row">
        <button type="button" className="btn hit" data-testid="seance-back" onClick={onLeave}>
          Back
        </button>
        <span className="label grow">Screen: Séance</span>
        <div className="toggle-cluster">
          <ExorciseToggle />
        </div>
      </div>
      <h1 id="seance-start-title" className="seance-title">
        THE SÉANCE
      </h1>
      <form
        className="panel col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!starting) host.start(title);
        }}
      >
        <label htmlFor={fieldId} className="label">
          Name of the séance
        </label>
        <input
          id={fieldId}
          className="field hit"
          type="text"
          autoComplete="off"
          value={title}
          disabled={starting}
          data-testid="seance-title-input"
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn hit" data-testid="seance-start" disabled={starting}>
          {starting ? LABEL_STARTING : LABEL_START}
        </button>
        <p className="hunt-message" data-testid="seance-keep-open">
          {MSG_KEEP_OPEN}
        </p>
        {host.startError !== null ? (
          <p className="hunt-message is-error" role="alert" data-testid="seance-start-error">
            {host.startError}
          </p>
        ) : null}
      </form>
    </main>
  );
}

function DownloadControl({ host }: { host: SeanceHostView }): ReactElement {
  return (
    <>
      <button type="button" className="btn hit" data-testid="seance-download" onClick={host.download}>
        {LABEL_DOWNLOAD}
      </button>
      {host.downloadError !== null ? (
        <p className="hunt-message is-error" role="alert" data-testid="seance-download-error">
          {host.downloadError}
        </p>
      ) : null}
    </>
  );
}

function RoomDisplay({ host, onLeave }: { host: SeanceHostView; onLeave: () => void }): ReactElement {
  const holdDescId = useId();
  const progress = host.ending ? 0 : Math.max(0, Math.min(1, host.endHold.progress));
  const status = host.screeching ? TEXT_SCREECHING : `Next screech in ${host.countdownSeconds} s`;
  return (
    <main className="screen screen-wide seance-room" aria-labelledby="seance-room-title">
      <div className="row">
        <button type="button" className="btn outline hit" data-testid="seance-leave" onClick={onLeave}>
          Leave
        </button>
        <span className="label grow">Screen: Séance</span>
        <div className="toggle-cluster">
          <ExorciseToggle />
        </div>
      </div>
      <h1 id="seance-room-title" className="seance-title" data-testid="seance-title">
        {host.title}
      </h1>

      <CandleCircle candles={host.candles.circle}>
        <span className="seance-souls" aria-hidden="true">
          {host.soulCount}
        </span>
      </CandleCircle>
      <p className="glow" role="status" data-testid="seance-souls" style={{ margin: 0, textAlign: 'center' }}>
        {soulsText(host.soulCount)}
      </p>

      {host.candles.overflow.length > 0 ? (
        <ul className="seance-overflow" aria-label="More souls" data-testid="seance-overflow">
          {host.candles.overflow.map((c, i) => (
            <li key={`${c.at}-${i}`}>{c.name}</li>
          ))}
        </ul>
      ) : null}

      <div className="beacon-status" role="status" data-testid="seance-status">
        {host.screeching ? (
          <span className="beacon-screeching fx-pulse" data-testid="seance-screeching">
            {TEXT_SCREECHING}
          </span>
        ) : (
          <span data-testid="seance-countdown">{status}</span>
        )}
      </div>

      {host.pollError !== null ? (
        <p className="hunt-message is-error" role="status" data-testid="seance-no-signal">
          {host.pollError}
        </p>
      ) : null}
      {host.audioBlocked ? (
        <button
          type="button"
          className="btn hit is-error"
          data-testid="seance-wake-sound"
          onClick={host.wakeSound}
        >
          {SILENT_MESSAGE}
        </button>
      ) : null}
      {host.screechError !== null ? (
        <p className="hunt-message is-error" role="alert" data-testid="seance-screech-error">
          {host.screechError}
        </p>
      ) : null}
      {host.wakeWarning ? (
        <p className="hunt-message" role="status" data-testid="seance-wake-warning">
          {WAKE_WARNING_MESSAGE}
        </p>
      ) : null}

      <DownloadControl host={host} />

      <button
        type="button"
        className="hit screech-key"
        data-testid="seance-end"
        aria-describedby={holdDescId}
        data-progress={progress}
        disabled={host.ending}
        {...host.endHold.handlers}
      >
        <span className="screech-key-fill" aria-hidden="true" style={{ width: `${progress * 100}%` }} />
        <span className="screech-key-label">{host.ending ? 'CLOSING...' : 'END SÉANCE'}</span>
        <span className="screech-key-hint">hold to end</span>
        <span id={holdDescId} className="sr-only">
          Hold for {HOLD_DURATION_MS} ms to end the séance. A tap does nothing.
        </span>
      </button>
      {host.endError !== null ? (
        <p className="hunt-message is-error" role="alert" data-testid="seance-end-error">
          {host.endError}
        </p>
      ) : null}
    </main>
  );
}

function EndedView({ host, onLeave }: { host: SeanceHostView; onLeave: () => void }): ReactElement {
  return (
    <main className="screen seance-room" aria-labelledby="seance-ended-title">
      <div className="row">
        <button type="button" className="btn hit" data-testid="seance-back" onClick={onLeave}>
          Back
        </button>
        <span className="label grow">Screen: Séance</span>
        <div className="toggle-cluster">
          <ExorciseToggle />
        </div>
      </div>
      <h1 id="seance-ended-title" className="seance-title" data-testid="seance-title">
        {host.title}
      </h1>
      <p className="glow" role="status" data-testid="seance-ended" style={{ margin: 0 }}>
        {TEXT_ENDED}
      </p>
      <p className="seance-note" data-testid="seance-final-count">
        {soulsText(host.soulCount)}
      </p>
      <DownloadControl host={host} />
    </main>
  );
}

/** Screen: the host starts a séance, shows who has arrived, screeches, and ends it. */
export default function SeanceHost({ onLeave }: SeanceHostProps): ReactElement {
  const host = useSeanceHost();
  let body: ReactElement;
  if (host.phase === 'open') body = <RoomDisplay host={host} onLeave={onLeave} />;
  else if (host.phase === 'ended') body = <EndedView host={host} onLeave={onLeave} />;
  else body = <StartForm host={host} onLeave={onLeave} />;
  return <CrtFrame>{body}</CrtFrame>;
}
