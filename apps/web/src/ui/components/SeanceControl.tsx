import type { ReactElement } from 'react';

export const SEANCE_CONTROL_LABEL = 'Hold a séance';

export interface SeanceControlProps {
  /** Opens the host screen. */
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

/** Control on Awaken and Speak that opens the séance host screen. */
export default function SeanceControl({ onClick, disabled = false }: SeanceControlProps): ReactElement {
  return (
    <button
      type="button"
      className="btn secondary hit seance-control"
      onClick={onClick}
      disabled={disabled}
    >
      {SEANCE_CONTROL_LABEL}
    </button>
  );
}
