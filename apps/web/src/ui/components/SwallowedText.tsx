const MAX_LETTERS = 80;
export interface SwallowedTextProps {
  /** What is being sent. Long text is cut to the first letters. */
  readonly text: string;
  /** Real playback progress, 0..1. */
  readonly progress: number;
}
interface Group {
  /** Index of the first letter of the group in the whole message. */
  readonly start: number;
  readonly letters: readonly string[];
  readonly isSpace: boolean;
}
/** Splits letters into words and single spaces. Punctuation stays with its word. */
function groupLetters(letters: readonly string[]): Group[] {
  const groups: Group[] = [];
  letters.forEach((ch, i) => {
    const isSpace = ch === ' ';
    const last = groups[groups.length - 1];
    if (last !== undefined && !isSpace && !last.isSpace) {
      (last.letters as string[]).push(ch);
    } else {
      groups.push({ start: i, letters: [ch], isSpace });
    }
  });
  return groups;
}
/**
 * Letters of the message, swallowed one by one as the sound plays. Each word is a
 * non-breaking inline-block, so lines only break at spaces.
 */
export default function SwallowedText({ text, progress }: SwallowedTextProps) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const shown = Array.from(flat);
  const letters = shown.length > MAX_LETTERS ? [...shown.slice(0, MAX_LETTERS - 1), '…'] : shown;
  const n = letters.length;
  const swallowed = n === 0 ? 0 : Math.floor(Math.max(0, Math.min(1, progress)) * n + 1e-9);
  const letter = (ch: string, i: number) => (
    <span
      // The index is the identity: letters never reorder.
      key={i}
      className={`swallow${i < swallowed ? ' is-swallowed' : ''}`}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
  return (
    <div className="swallow-box" role="img" aria-label="Message being sent" data-testid="swallowed-text">
      {groupLetters(letters).map((g) =>
        g.isSpace ? (
          letter(' ', g.start)
        ) : (
          <span key={g.start} className="swallow-word" data-testid="swallow-word">
            {g.letters.map((ch, j) => letter(ch, g.start + j))}
          </span>
        ),
      )}
    </div>
  );
}
