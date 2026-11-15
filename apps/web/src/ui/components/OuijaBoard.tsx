import { spellProgress } from '../../logic/ouija';
import { useMotion } from '../hooks/useMotion';

export interface OuijaBoardProps {
  /** The full decoded value. */
  readonly value: string;
  /** Milliseconds since spelling began. Ignored under reduced motion. */
  readonly elapsedMs: number;
}

const BOARD_W = 350;
const BOARD_H = 262;
const CX = 175;
const CY = 236;

interface Spot {
  readonly ch: string;
  readonly x: number;
  readonly y: number;
}

function arc(letters: readonly string[], radius: number, from: number, to: number): Spot[] {
  return letters.map((ch, i) => {
    const a = ((from + ((to - from) * i) / (letters.length - 1)) * Math.PI) / 180;
    return { ch, x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
  });
}

const SPOTS: readonly Spot[] = [
  ...arc('ABCDEFGHIJKLM'.split(''), 158, 198, 342),
  ...arc('NOPQRSTUVWXYZ'.split(''), 108, 205, 335),
];

const SPOT_BY_CHAR: ReadonlyMap<string, Spot> = new Map(SPOTS.map((s) => [s.ch, s]));

/** Resting place of the planchette before any board letter is spelled. */
const REST: Spot = { ch: '', x: CX, y: 130 };

/** Board letter for a character, or null when the board has no such letter. */
function boardSpot(ch: string): Spot | null {
  return SPOT_BY_CHAR.get(ch.toUpperCase()) ?? null;
}

const pct = (n: number, total: number): string => `${(n / total) * 100}%`;

/**
 * Spirit board. The planchette sits on the board letter most recently spelled.
 * Spelled characters are appended in one steady colour with no per-letter
 * animation. The whole display is aria-hidden; the Reveal screen exposes the
 * full text separately.
 */
export default function OuijaBoard({ value, elapsedMs }: OuijaBoardProps) {
  const { reduced } = useMotion();
  const chars = Array.from(value);
  const { count } = reduced ? { count: chars.length } : spellProgress(elapsedMs, chars.length);
  const shown = chars.slice(0, count);

  let current: Spot = REST;
  for (const ch of shown) {
    const spot = boardSpot(ch);
    if (spot !== null) current = spot;
  }

  return (
    <div className="ouija" aria-hidden="true" data-testid="ouija-board">
      <div className="ouija-board">
        <span className="ouija-word ouija-yes">YES</span>
        <span className="ouija-word ouija-no">NO</span>
        {SPOTS.map((s) => (
          <span
            key={s.ch}
            className={`ouija-letter${s === current ? ' is-lit' : ''}`}
            style={{ left: pct(s.x - 11, BOARD_W), top: pct(s.y - 12, BOARD_H) }}
          >
            {s.ch}
          </span>
        ))}
        <span className="ouija-bye">GOOD BYE</span>
        <svg
          className="ouija-planchette"
          data-testid="planchette"
          data-letter={current.ch}
          viewBox="0 0 76 92"
          style={{ left: pct(current.x - 38, BOARD_W), top: pct(current.y - 46, BOARD_H) }}
        >
          <path
            d="M38 2C58 2 72 22 72 44c0 22-16 42-34 46C20 86 4 66 4 44 4 22 18 2 38 2z"
            fill="rgba(233,228,212,.12)"
            stroke="#e9e4d4"
            strokeWidth="2"
          />
          <circle cx="38" cy="36" r="13" fill="rgba(5,8,6,.35)" stroke="#39ff7a" strokeWidth="2" />
        </svg>
      </div>
      <div className="ouija-spelled-wrap">
        <span className="ouija-caption">THE SPIRITS SPELL</span>
        <p className="ouija-spelled" data-testid="ouija-spelled">
          {shown.join('')}
        </p>
      </div>
    </div>
  );
}
