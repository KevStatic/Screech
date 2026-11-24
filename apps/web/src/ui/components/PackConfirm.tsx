import type { ReactElement } from 'react';

export interface PackConfirmProps {
  /** Number of fields holding Custom_Text, from `customCountToOverwrite`. */
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Plain-words question naming how many fields hold the host's own text. */
export function packConfirmText(count: number): string {
  return count === 1
    ? '1 field holds your own text. Replace it with the pack?'
    : `${count} fields hold your own text. Replace them with the pack?`;
}

/** Inline confirmation before a pack overwrites typed text. Nothing changes until confirmed. */
export default function PackConfirm({ count, onConfirm, onCancel }: PackConfirmProps): ReactElement {
  return (
    <div role="group" aria-label="Replace typed text with the pack" className="note hunt-controls">
      <p className="hunt-message">{packConfirmText(count)}</p>
      <button type="button" className="btn hit" onClick={onConfirm}>
        Replace with pack
      </button>
      <button type="button" className="btn hit" onClick={onCancel}>
        Keep my text
      </button>
    </div>
  );
}
