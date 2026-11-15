import type { ReactElement } from 'react';
import type { FlowApi } from '../hooks/useFlow';
import CrtFrame from '../components/CrtFrame';
import ExorciseToggle from '../components/ExorciseToggle';
export const MSG_GARBLED = 'This message arrived damaged.';
export const LABEL_RETURN_LISTEN = 'Back to Listen';
export interface GarbledProps {
  readonly flow: Pick<FlowApi, 'dispatch'>;
}
/** Shown when a packet decodes to `invalid-body`. */
export default function Garbled({ flow }: GarbledProps): ReactElement {
  return (
    <CrtFrame>
      <main className="screen" aria-labelledby="garbled-title">
        <div className="row">
          <span className="label grow">Screen: Garbled</span>
          <ExorciseToggle />
        </div>
        <h1 id="garbled-title" className="glow is-error" style={{ margin: 0, fontWeight: 400 }}>
          STATIC ON THE LINE
        </h1>
        <p className="note is-error" role="alert" data-testid="garbled-message">
          {MSG_GARBLED}
        </p>
        <div className="col" style={{ marginTop: 'auto' }}>
          <button
            type="button"
            className="btn hit"
            data-testid="garbled-back"
            onClick={() => flow.dispatch({ type: 'back', target: 'listen' })}
          >
            {LABEL_RETURN_LISTEN}
          </button>
        </div>
      </main>
    </CrtFrame>
  );
}
