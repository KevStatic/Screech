const MAX_LETTERS = 80;
export interface SwallowedTextProps {
  /** What is being sent. Long text is cut to the first letters. */
  readonly text: string;
  /** Real playback progress, 0..1. */
  readonly progress: number;
}
/** Letters of the message, swallowed one by one as the sound plays. */
export default function SwallowedText({ text, progress }: SwallowedTextProps) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const shown = Array.from(flat);
  const letters = shown.length > MAX_LETTERS ? [...shown.slice(0, MAX_LETTERS - 1), '…'] : shown;
  const n = letters.length;
  const swallowed = n === 0 ? 0 : Math.floor(Math.max(0, Math.min(1, progress)) * n + 1e-9);
  return (
    <div className="swallow-box" role="img" aria-label="Message being sent" data-testid="swallowed-text">
      {letters.map((ch, i) => (
        <span
          // The index is the identity: letters never reorder.
          key={i}
          className={`swallow${i < swallowed ? ' is-swallowed' : ''}`}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
