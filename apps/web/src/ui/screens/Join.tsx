import { useEffect, type ChangeEvent, type ReactElement } from 'react';
import type { CheckinFields } from '@screech/core';
import CrtFrame from '../components/CrtFrame';
import { REACHING_TEXT, useJoin } from '../hooks/useJoin';
import type { JoinDeps } from '../hooks/useJoin';
import Lit from './Lit';

export const LABEL_RETRY = 'Retry';
export const LABEL_LEAVE = 'Leave';
export const LABEL_LISTEN_AGAIN = 'Listen again';

export interface JoinProps {
  /** The fields from the first decoded Checkin_Packet. */
  readonly initial: CheckinFields;
  /** A newer decoded Checkin_Packet. Only replaces the code (13.10). */
  readonly latest?: CheckinFields | null;
  /** Leave: back to Listen, no request (14.12). */
  readonly onLeave: () => void;
  /** "Listen again" and "Back to listening": back to Listen. The typed name is passed along. */
  readonly onListenAgain: (name: string) => void;
  /** Test seam for fetch and storage. */
  readonly deps?: Partial<JoinDeps>;
}

/**
 * The Join_Screen (Requirements 13, 14, 16). Owns useJoin and renders the
 * Lit_Screen once the check-in succeeds. No UI_Sound. Title and name are text nodes.
 */
export default function Join({ initial, latest, onLeave, onListenAgain, deps }: JoinProps): ReactElement {
  const view = useJoin(initial, { onLeave, onListenAgain }, deps);
  const { receive } = view;
  useEffect(() => {
    if (latest) receive(latest);
  }, [latest, receive]);

  const lit = view.lit;
  if (lit !== null) {
    return (
      <Lit
        name={lit.name}
        title={lit.title}
        alreadyCheckedIn={lit.alreadyCheckedIn}
        onBack={() => onListenAgain(lit.name)}
      />
    );
  }

  const loading = view.publicPhase === 'loading';
  const overLimit = view.remaining < 0;
  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="join-title">
        <h1 id="join-title" className="seance-title" data-testid="join-title">
          {loading || view.title === null ? REACHING_TEXT : view.title}
        </h1>

        {view.notice !== null ? (
          <p className="note is-error" role="alert" data-testid="join-notice" style={{ margin: 0 }}>
            {view.notice}
          </p>
        ) : null}

        {view.publicPhase === 'no-signal' ? (
          <button type="button" className="btn hit" data-testid="join-retry-public" onClick={view.retryPublic}>
            {LABEL_RETRY}
          </button>
        ) : null}

        {view.showJoin ? (
          <div className="col">
            <label className="label" htmlFor="join-name">
              Your name
            </label>
            <input
              id="join-name"
              className="field"
              data-testid="join-name"
              type="text"
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              value={view.name}
              aria-invalid={view.nameMessage !== null}
              aria-describedby="join-name-count"
              onChange={(e: ChangeEvent<HTMLInputElement>) => view.setName(e.target.value)}
            />
            <span
              id="join-name-count"
              className={`label${overLimit ? ' is-error' : ''}`}
              data-testid="join-remaining"
            >
              {view.remaining} left
            </span>
            {view.nameMessage !== null ? (
              <p className="note is-error" data-testid="join-name-message" style={{ margin: 0 }}>
                {view.nameMessage}
              </p>
            ) : null}
            <button
              type="button"
              className="btn hit"
              data-testid="join-button"
              disabled={!view.joinEnabled}
              onClick={view.join}
            >
              {view.joinLabel}
            </button>
          </div>
        ) : null}

        {view.error !== null ? (
          <p className="note is-error" role="alert" data-testid="join-error" style={{ margin: 0 }}>
            {view.error}
          </p>
        ) : null}

        <div className="col" style={{ marginTop: 'auto' }}>
          {view.showRetry ? (
            <button type="button" className="btn hit" data-testid="join-retry" onClick={view.join}>
              {LABEL_RETRY}
            </button>
          ) : null}
          {view.showListenAgain ? (
            <button type="button" className="btn hit" data-testid="join-listen-again" onClick={view.listenAgain}>
              {LABEL_LISTEN_AGAIN}
            </button>
          ) : null}
          <button type="button" className="btn secondary hit" data-testid="join-leave" onClick={view.leave}>
            {LABEL_LEAVE}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
