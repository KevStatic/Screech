import { counterHeading, counterRows } from '../../logic/hunt-found';
import type { FoundState } from '../../logic/hunt-found';

export interface SpiritCounterProps {
  readonly state: FoundState;
}

/**
 * Spirits found so far. Found Spirits show a filled mark and their name, the rest show an
 * unfilled mark and "unknown". Names are rendered as React text children, never as HTML.
 * The root exposes one text value to assistive technology (the heading followed by the
 * list), and its children are presentational, so no name is announced on its own.
 */
export default function SpiritCounter({ state }: SpiritCounterProps) {
  const heading = counterHeading(state);
  const rows = counterRows(state);
  const spoken = `${heading}. ${rows
    .map((row) => `Spirit ${row.index} of ${state.total}: ${row.name ?? 'unknown'}`)
    .join('. ')}.`;

  return (
    <div className="spirit-counter" role="img" aria-label={spoken} data-testid="spirit-counter">
      <p className="spirit-counter-heading">{heading}</p>
      <ul className="spirit-counter-list">
        {rows.map((row) => {
          const found = row.name !== null;
          return (
            <li key={row.index} className={`spirit-row${found ? ' is-found' : ''}`}>
              <span className={`spirit-mark${found ? ' is-found' : ''}`} aria-hidden="true" />
              <span className="spirit-name">{found ? row.name : 'unknown'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
