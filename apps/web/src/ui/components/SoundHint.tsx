import type { ReactElement } from 'react';
import { SOUND_HINT_TEXT } from '../../logic/sound-hint';
import { useSoundHint } from '../hooks/useSoundHint';

/** One-time iOS silent switch hint. In-flow, no focus steal, no sound, no motion. */
export default function SoundHint(): ReactElement | null {
  const { visible, dismiss } = useSoundHint();
  if (!visible) return null;
  return (
    <div role="status" className="note sound-hint">
      <span className="sound-hint-text">{SOUND_HINT_TEXT}</span>
      <button
        type="button"
        className="hit sound-hint-dismiss"
        aria-label="Dismiss the silent switch hint"
        onClick={dismiss}
      >
        OK
      </button>
    </div>
  );
}
