import type { ReactElement } from 'react';
import CrtFrame from '../components/CrtFrame';
import { useMotion } from '../hooks/useMotion';

export const LIT_HEADING = 'Your candle is lit';
export const LIT_ALREADY_NOTE = 'You were already counted.';
export const LABEL_BACK_TO_LISTENING = 'Back to listening';

export interface LitProps {
  readonly name: string;
  readonly title: string;
  readonly alreadyCheckedIn: boolean;
  readonly onBack: () => void;
}

/**
 * The Lit_Screen (Requirement 15). No check-in control, no red, no UI_Sound.
 * The candle lights once (2.4 s, smooth, no flashing) on a first check-in and
 * stays still. A repeat check-in, Exorcise or reduced motion shows it already lit.
 * Name and Title are React text nodes.
 */
export default function Lit({ name, title, alreadyCheckedIn, onBack }: LitProps): ReactElement {
  const { reduced } = useMotion();
  const animate = !alreadyCheckedIn && !reduced;
  return (
    <CrtFrame>
      <main className="screen seance-lit" aria-labelledby="lit-heading">
        <h1 id="lit-heading" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          {LIT_HEADING}
        </h1>
        <div className="seance-lit-candle" aria-hidden="true">
          <svg
            className={`seance-flame ${animate ? 'is-lighting' : 'is-still'}`}
            data-testid="lit-flame"
            data-animated={animate ? 'true' : 'false'}
            viewBox="0 0 26 36"
          >
            <path d="M13 1C17 9 23 14 23 22a10 10 0 0 1-20 0C3 15 9 10 13 1z" fill="#ffb347" />
            <path d="M13 13c2 4 5 6 5 10a5 5 0 0 1-10 0c0-3 3-6 5-10z" fill="#fff1c9" />
          </svg>
          <span className="seance-wick" />
          <span className="seance-wax" />
        </div>
        <p className="seance-name" data-testid="lit-name" style={{ margin: 0, fontSize: 'var(--fs-body)' }}>
          {name}
        </p>
        <p className="seance-title" data-testid="lit-title">
          {title}
        </p>
        {alreadyCheckedIn ? (
          <p className="note" data-testid="lit-already" role="status">
            {LIT_ALREADY_NOTE}
          </p>
        ) : null}
        <div className="col" style={{ marginTop: 'auto' }}>
          <button type="button" className="btn hit" data-testid="lit-back" onClick={onBack}>
            {LABEL_BACK_TO_LISTENING}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
