import type { ReactElement } from 'react';
export interface ModeSwitchProps {
  readonly current: 'speak' | 'listen';
  readonly onSpeak?: () => void;
  readonly onListen?: () => void;
  readonly listenDisabled?: boolean;
  /** Runs on click and key down of either button (audio keep-alive). */
  readonly onGesture?: () => void;
}
/** SPEAK | LISTEN switch, shown at the top of both screens. The current mode is aria-current. */
export default function ModeSwitch({
  current,
  onSpeak,
  onListen,
  listenDisabled = false,
  onGesture,
}: ModeSwitchProps): ReactElement {
  const item = (mode: 'speak' | 'listen', label: string, act?: () => void, disabled = false): ReactElement => (
    <button
      type="button"
      className={`hit mode-btn${current === mode ? ' is-current' : ''}`}
      aria-current={current === mode ? 'page' : undefined}
      data-testid={mode === 'speak' && current === 'listen' ? 'listen-back' : undefined}
      disabled={disabled}
      onClick={() => {
        onGesture?.();
        if (current !== mode) act?.();
      }}
      onKeyDown={onGesture}
    >
      {label}
    </button>
  );
  return (
    <nav className="mode-switch" aria-label="Mode">
      {item('speak', 'SPEAK', onSpeak)}
      {item('listen', 'LISTEN', onListen, listenDisabled)}
    </nav>
  );
}
