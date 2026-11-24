import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { huntIdFromBytes } from '../../logic/hunt-id';
import {
  customCountToOverwrite,
  initialDraft,
  setupReducer,
  setupView,
  type RowField,
} from '../../logic/hunt-setup';
import { buildPrintModel } from '../../logic/qr-cards';
import { sanitizeClueText, SPIRIT_TOTAL_MAX, SPIRIT_TOTAL_MIN } from '@screech/core';
import type { PackId } from '../../logic/riddle-packs';
import ByteCounter from '../components/ByteCounter';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
import PackConfirm from '../components/PackConfirm';
import QrCard from '../components/QrCard';

export const MSG_NO_HUNT_ID =
  'A Hunt ID could not be made. This browser would not give random numbers. Your text is kept, but links and printing are off.';
export const MSG_COPIED = 'Link copied.';
export const MSG_COPY_FAILED = 'Copying failed. Select the link below and copy it by hand.';
export const MSG_PRINT_FAILED = 'Printing failed. This browser could not open the print dialog.';
export const MSG_PACK_NOTE = 'Pack text was not filled again. Press a pack button to fill it.';
/** The copy confirmation stays for 3 s (allowed range: 2 to 5 s). */
export const COPY_CONFIRM_MS = 3000;

const PACKS: readonly { readonly id: PackId; readonly label: string }[] = [
  { id: 'office', label: 'Office pack' },
  { id: 'home', label: 'Home pack' },
  { id: 'classroom', label: 'Classroom pack' },
];

const TOTALS: readonly number[] = Array.from(
  { length: SPIRIT_TOTAL_MAX - SPIRIT_TOTAL_MIN + 1 },
  (_, i) => SPIRIT_TOTAL_MIN + i,
);

/** Makes a Hunt_ID from crypto.getRandomValues. Returns null on any failure. */
function makeHuntId(): string | null {
  try {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const result = huntIdFromBytes(bytes);
    return result.ok ? result.id : null;
  } catch {
    return null;
  }
}

/** Page origin and path with query and fragment removed. Reads no network. */
function pageBaseUrl(): string {
  try {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}`;
  } catch {
    return '';
  }
}

export interface HuntSetupProps {
  /** Dispatches `closeHuntSetup`. */
  readonly onBack: () => void;
}

/** Screen: the host writes a Hunt and prints or shows one setup QR per Spirit. */
export default function HuntSetup({ onBack }: HuntSetupProps): ReactElement {
  const [draft, dispatch] = useReducer(setupReducer, undefined, initialDraft);
  const [huntId, setHuntId] = useState<string | null>(() => makeHuntId());
  const [copied, setCopied] = useState<number | null>(null);
  const [copyFailed, setCopyFailed] = useState<number | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const view = useMemo(() => setupView(huntId, draft), [huntId, draft]);
  const model = useMemo(
    () => (huntId === null ? null : buildPrintModel(huntId, draft, pageBaseUrl())),
    [huntId, draft],
  );
  const linksOn = huntId !== null && model !== null;
  const openingText = sanitizeClueText(draft.opening);

  const regenerate = useCallback((): void => {
    setHuntId(makeHuntId());
    setCopied(null);
    setCopyFailed(null);
  }, []);

  async function copyLink(index: number, link: string): Promise<void> {
    if (timer.current !== null) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(link);
      setCopyFailed(null);
      setCopied(index);
      timer.current = setTimeout(() => setCopied(null), COPY_CONFIRM_MS);
    } catch {
      setCopied(null);
      setCopyFailed(index);
    }
  }

  function print(): void {
    try {
      window.print();
      setPrintFailed(false);
    } catch {
      setPrintFailed(true);
    }
  }

  const edit = (row: number, field: RowField) => (value: string) =>
    dispatch({ type: 'edit', row, field, value });

  return (
    <CrtFrame>
      <main className="screen screen-wide" aria-labelledby="hunt-setup-title">
        <div className="row no-print">
          <button type="button" className="btn hit" data-testid="hunt-back" onClick={onBack}>
            Back
          </button>
          <span className="label grow">Screen: Ghost Hunt</span>
          <div className="toggle-cluster">
            <ExorciseToggle />
          </div>
        </div>
        <h1
          id="hunt-setup-title"
          className="title fx-boot-title no-print"
          style={{ fontSize: 56 }}
        >
          GHOST HUNT
        </h1>

        {openingText !== '' ? (
          <p className="hunt-opening" data-testid="hunt-opening">
            {openingText}
          </p>
        ) : null}

        <section className="panel col hunt-controls no-print" aria-label="Hunt">
          <p className="note" data-testid="hunt-id">
            {huntId !== null ? `Hunt ID: ${huntId}` : 'Hunt ID: none'}
          </p>
          <button type="button" className="btn hit" data-testid="hunt-regenerate" onClick={regenerate}>
            New Hunt ID
          </button>
          {huntId === null ? (
            <p className="hunt-message is-error" role="alert" data-testid="hunt-id-error">
              {MSG_NO_HUNT_ID}
            </p>
          ) : null}

          <label htmlFor="hunt-opening-input" className="label">
            Opening riddle (read aloud to start)
          </label>
          <textarea
            id="hunt-opening-input"
            className="field"
            rows={3}
            value={draft.opening}
            onChange={(e) => dispatch({ type: 'editOpening', value: e.target.value })}
          />

          <label htmlFor="hunt-total" className="label">
            Number of spirits
          </label>
          <select
            id="hunt-total"
            className="field"
            value={draft.total}
            onChange={(e) => dispatch({ type: 'setTotal', total: Number(e.target.value) })}
          >
            {TOTALS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <div className="row" role="group" aria-label="Riddle packs">
            {PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn hit"
                aria-pressed={draft.appliedPack === p.id}
                data-testid={`hunt-pack-${p.id}`}
                onClick={() => dispatch({ type: 'choosePack', pack: p.id })}
              >
                {p.label}
              </button>
            ))}
          </div>
          {draft.pendingPack !== null ? (
            <PackConfirm
              count={customCountToOverwrite(draft)}
              onConfirm={() => dispatch({ type: 'confirmPack' })}
              onCancel={() => dispatch({ type: 'cancelPack' })}
            />
          ) : null}
          {draft.packNote ? <p className="hunt-message">{MSG_PACK_NOTE}</p> : null}
        </section>

        <div className="hunt-grid">
          {draft.rows.slice(0, draft.total).map((row, i) => {
            const n = i + 1;
            const status = view.statuses[i];
            const card = model?.cards[i];
            return (
              <section key={n} className="col hunt-row" aria-label={`Spirit ${n}`} data-testid={`hunt-row-${n}`}>
                <div className="panel col hunt-controls hunt-row-fields no-print">
                  <h2 className="label" style={{ margin: 0 }}>{`Spirit ${n} of ${draft.total}`}</h2>
                  <label htmlFor={`hunt-name-${n}`} className="label">{`Spirit ${n} name`}</label>
                  <input
                    id={`hunt-name-${n}`}
                    className="field"
                    type="text"
                    value={row.name}
                    onChange={(e) => edit(i, 'name')(e.target.value)}
                  />
                  <label htmlFor={`hunt-hide-${n}`} className="label">{`Spirit ${n} hide at`}</label>
                  <input
                    id={`hunt-hide-${n}`}
                    className="field"
                    type="text"
                    value={row.hideAt}
                    onChange={(e) => edit(i, 'hideAt')(e.target.value)}
                  />
                  <label htmlFor={`hunt-clue-${n}`} className="label">{`Spirit ${n} clue`}</label>
                  <textarea
                    id={`hunt-clue-${n}`}
                    className="field"
                    rows={3}
                    value={row.clue}
                    onChange={(e) => edit(i, 'clue')(e.target.value)}
                  />
                  {status !== undefined ? <ByteCounter status={status} /> : null}
                </div>
                {card !== undefined ? (
                  <>
                    <div className="hunt-row-qr col">
                    <QrCard model={card} />
                    <div className="hunt-controls no-print">
                      <button
                        type="button"
                        className="btn hit"
                        data-testid={`hunt-copy-${n}`}
                        onClick={() => void copyLink(n, card.link)}
                      >
                        {`Copy link for spirit ${n}`}
                      </button>
                      {copied === n ? (
                        <p className="hunt-message" role="status" data-testid={`hunt-copied-${n}`}>
                          {MSG_COPIED}
                        </p>
                      ) : null}
                      {copyFailed === n ? (
                        <div>
                          <p className="hunt-message is-error" role="alert">
                            {MSG_COPY_FAILED}
                          </p>
                          <p
                            className="qr-link"
                            style={{ userSelect: 'text', overflowWrap: 'anywhere' }}
                            data-testid={`hunt-link-${n}`}
                          >
                            {card.link}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    </div>
                  </>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className="col hunt-controls no-print" aria-label="Print">
          {view.summary !== null ? (
            <p className="hunt-message is-error" role="status" data-testid="hunt-summary">
              {view.summary}
            </p>
          ) : null}
          {view.limitProblems.slice(view.summary === view.limitProblems[0] ? 1 : 0).map((p) => (
            <p key={p} className="hunt-message is-error">
              {p}
            </p>
          ))}
          <button
            type="button"
            className="btn hit"
            data-testid="hunt-print"
            disabled={!linksOn}
            onClick={print}
          >
            Print cards
          </button>
          {printFailed ? (
            <p className="hunt-message is-error" role="alert" data-testid="hunt-print-error">
              {MSG_PRINT_FAILED}
            </p>
          ) : null}
        </section>
      </main>
    </CrtFrame>
  );
}
