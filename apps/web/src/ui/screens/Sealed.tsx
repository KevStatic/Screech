import { useEffect } from 'react';
import type { ReactElement } from 'react';
import type { FlowApi } from '../hooks/useFlow';
import CrtFrame from '../components/CrtFrame';
import ToggleCluster from '../components/ToggleCluster';
import { useHaunt } from '../hooks/useHaunt';
export const MSG_SEALED = 'A sealed message. Join the pact to read it.';
export const LABEL_RETURN_LISTEN = 'Back to Listen';
export interface SealedProps {
  readonly flow: Pick<FlowApi, 'dispatch'>;
}
/** Shown when a packet decodes to `key-required`. */
export default function Sealed({ flow }: SealedProps): ReactElement {
  const haunt = useHaunt();
  useEffect(() => {
    haunt.play('sealed-thud');
    return () => haunt.stopOneShots();
  }, [haunt]);
  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="sealed-title">
        <div className="row">
          <span className="label grow">Screen: Sealed</span>
          <ToggleCluster />
        </div>
        <h1 id="sealed-title" className="glow is-seal" style={{ margin: 0, fontWeight: 400 }}>
          THE SEAL HOLDS
        </h1>
        <p className="note is-seal" data-testid="sealed-message">
          {MSG_SEALED}
        </p>
        <div className="col" style={{ marginTop: 'auto' }}>
          <button
            type="button"
            className="btn hit"
            data-testid="sealed-back"
            onClick={() => flow.dispatch({ type: 'back', target: 'listen' })}
          >
            {LABEL_RETURN_LISTEN}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
