import type { ReactNode } from 'react';

export interface TarotCardProps {
  /** Roman numeral shown at the top of the card. */
  readonly numeral: string;
  /** Card name, e.g. "Whisper". */
  readonly title: string;
  /** Send type, e.g. "text". */
  readonly kind: string;
  /** Decorative icon. Hidden from assistive technology. */
  readonly icon?: ReactNode;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** One selectable send type. Pressed state is exposed through aria-pressed. */
export default function TarotCard(props: TarotCardProps) {
  const { numeral, title, kind, icon, selected, onSelect } = props;
  return (
    <button
      type="button"
      className={`hit tarot${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="tarot-numeral" aria-hidden="true">
        {numeral}
      </span>
      <span className="tarot-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tarot-name">{title}</span>
      <span className="tarot-kind">{kind}</span>
    </button>
  );
}
