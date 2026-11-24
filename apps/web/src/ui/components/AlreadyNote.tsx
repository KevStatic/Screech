import { noteText } from '../../logic/hunt-note';
import type { NoteState } from '../../logic/hunt-note';

export interface AlreadyNoteProps {
  readonly state: NoteState;
  readonly onReadAgain: () => void;
}

/**
 * Inline note on the Listen screen when a clue was already found. The live region stays
 * mounted so assistive technology announces changes; its text node is keyed by announceId,
 * so the same note is never announced twice. The clue appears as plain text outside the
 * live region after the Read_Again_Control is used. No links, no sound.
 */
export default function AlreadyNote({ state, onReadAgain }: AlreadyNoteProps) {
  const note = state.note;

  return (
    <div className="already-note-wrap hunt-controls" data-testid="already-note">
      <p className="already-note" role="status" aria-live="polite">
        {note !== null ? <span key={note.announceId}>{noteText(note)}</span> : null}
      </p>
      {note !== null && !note.clueShown ? (
        <button type="button" className="btn hit already-note-again" onClick={onReadAgain}>
          Read clue again
        </button>
      ) : null}
      {note !== null && note.clueShown ? (
        <p className="already-note-clue" data-testid="already-note-clue">
          {note.clue}
        </p>
      ) : null}
    </div>
  );
}
