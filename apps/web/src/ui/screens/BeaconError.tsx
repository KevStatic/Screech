import type { ReactElement } from 'react';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';

export const LABEL_OPEN_NORMAL = 'Open the normal app';

export interface BeaconErrorProps {
  /** Plain-words cause, for example "Too heavy to cross over (148/140 bytes)". */
  readonly message: string;
  /** Called after the fragment is removed; the app then shows Awaken. */
  readonly onOpenNormal: () => void;
}

/** Removes the fragment from the address bar without a reload. Never throws. */
export function stripFragment(): void {
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', pathname + search);
  } catch {
    // The address bar keeps the link; the app still moves on.
  }
}

/** Screen: the setup link cannot become a Beacon. Offers no start control. */
export default function BeaconError({ message, onOpenNormal }: BeaconErrorProps): ReactElement {
  function open(): void {
    stripFragment();
    onOpenNormal();
  }

  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="beacon-error-title">
        <div className="row">
          <span className="label grow">Screen: Beacon</span>
          <div className="toggle-cluster">
            <ExorciseToggle />
          </div>
        </div>
        <h1 id="beacon-error-title" className="glow" style={{ margin: 0, fontWeight: 400 }}>
          THE BEACON WILL NOT WAKE
        </h1>
        <div className="panel col is-error" role="alert" data-testid="beacon-error-message">
          <p className="beacon-error">{message}</p>
        </div>
        <button type="button" className="btn hit" data-testid="beacon-open-normal" onClick={open}>
          {LABEL_OPEN_NORMAL}
        </button>
      </main>
    </CrtFrame>
  );
}
