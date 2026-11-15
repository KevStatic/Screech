import { useMotion } from '../hooks/useMotion';
export default function ExorciseToggle() {
  const { toggle, system, reduced, setExorcise } = useMotion();
  const on = system ? true : toggle;
  return (
    <div className="exorcise">
      <button
        type="button"
        className="hit exorcise-toggle"
        role="switch"
        aria-checked={reduced}
        disabled={system}
        onClick={() => setExorcise(!toggle)}
      >
        Exorcise: {on ? 'on' : 'off'}
      </button>
      {system ? <p role="note">System setting is in effect.</p> : null}
    </div>
  );
}
