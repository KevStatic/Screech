import { useSoundPref } from '../hooks/useSoundPref';

export default function SoundToggle() {
  const { on, setSound } = useSoundPref();
  return (
    <button
      type="button"
      className={`hit sound-toggle${on ? '' : ' is-off'}`}
      role="switch"
      aria-checked={on}
      onClick={() => setSound(!on)}
    >
      Sound: {on ? 'on' : 'off'}
    </button>
  );
}
