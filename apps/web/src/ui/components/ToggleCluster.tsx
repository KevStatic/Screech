import type { ReactElement } from 'react';
import { useHauntFailureNotice } from '../hooks/useHaunt';
import ExorciseToggle from './ExorciseToggle';
import SoundHint from './SoundHint';
import SoundToggle from './SoundToggle';

/** Sound toggle, Exorcise toggle, one-time hint, then the failure notice. */
export default function ToggleCluster(): ReactElement {
  const notice = useHauntFailureNotice();
  return (
    <div className="toggle-cluster">
      <SoundToggle />
      <ExorciseToggle />
      <SoundHint />
      {notice !== null ? (
        <div className="note sound-notice is-error" role="status">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
