import { useState, type ReactElement } from 'react';
import { buildClue, SIZE_CAP, type ClueFields } from '@screech/core';
import { decodeSetupFragment } from '../logic/hunt-link';
import { useAudioSession } from './hooks/useAudioSession';
import { useDraft } from './hooks/useDraft';
import { useFlow } from './hooks/useFlow';
import { useHauntBridge } from './hooks/useHaunt';
import Awaken from './screens/Awaken';
import Beacon from './screens/Beacon';
import BeaconError from './screens/BeaconError';
import Garbled from './screens/Garbled';
import HuntComplete from './screens/HuntComplete';
import HuntReveal from './screens/HuntReveal';
import HuntSetup from './screens/HuntSetup';
import Listen from './screens/Listen';
import Reveal from './screens/Reveal';
import Screeching from './screens/Screeching';
import Sealed from './screens/Sealed';
import SeanceHost from './screens/SeanceHost';
import Speak, { type TransmissionOutcome } from './screens/Speak';

const MSG_NO_TRANSMISSION = 'The sound did not leave the speaker.';

type StartRoute =
  | { readonly kind: 'normal' }
  | { readonly kind: 'beacon'; readonly fields: ClueFields }
  | { readonly kind: 'beacon-error'; readonly message: string };

const MSG_BAD_LINK = 'This setup link cannot be read.';

/** Reads the address fragment once. Never throws. */
function computeStartRoute(): StartRoute {
  let hash = '';
  try {
    hash = window.location.hash;
  } catch {
    return { kind: 'normal' };
  }
  const decoded = decodeSetupFragment(hash);
  if (decoded.kind === 'none') return { kind: 'normal' };
  if (decoded.kind === 'error') {
    return { kind: 'beacon-error', message: decoded.error.message || MSG_BAD_LINK };
  }
  const built = buildClue(decoded.fields);
  if (built.ok) return { kind: 'beacon', fields: decoded.fields };
  const error = built.error;
  const message =
    error.code === 'too-large'
      ? `Too heavy to cross over (${error.length}/${SIZE_CAP} bytes)`
      : error.message || MSG_BAD_LINK;
  return { kind: 'beacon-error', message };
}

/**
 * Screen switch. All send and listen exclusion lives in the flow reducer; this component
 * only routes. Awaken is the only screen at start.
 */
export default function App(): ReactElement {
  const flow = useFlow();
  const audio = useAudioSession();
  const draft = useDraft();
  const [start, setStart] = useState<StartRoute>(computeStartRoute);
  useHauntBridge(flow, audio, start.kind === 'beacon');
  const [outcome, setOutcome] = useState<TransmissionOutcome | null>(null);

  if (start.kind === 'beacon') return <Beacon fields={start.fields} />;
  if (start.kind === 'beacon-error') {
    return (
      <BeaconError
        message={start.message}
        onOpenNormal={() => setStart({ kind: 'normal' })}
      />
    );
  }

  switch (flow.state.screen) {
    case 'awaken':
      return <Awaken flow={flow} audio={audio} />;
    case 'speak':
      return <Speak flow={flow} audio={audio} draft={draft} onTransmission={setOutcome} />;
    case 'screeching':
      return (
        <Screeching
          flow={flow}
          outcome={outcome ?? { ok: false, message: MSG_NO_TRANSMISSION }}
        />
      );
    case 'listen':
      return <Listen flow={flow} audio={audio} />;
    case 'reveal':
      return <Reveal flow={flow} />;
    case 'garbled':
      return <Garbled flow={flow} />;
    case 'sealed':
      return <Sealed flow={flow} />;
    case 'hunt-setup':
      return <HuntSetup onBack={() => flow.dispatch({ type: 'closeHuntSetup' })} />;
    case 'hunt-reveal':
      return <HuntReveal flow={flow} />;
    case 'hunt-complete':
      return <HuntComplete flow={flow} audio={audio} />;
    case 'seance-host':
      return <SeanceHost onLeave={() => flow.dispatch({ type: 'closeSeanceHost' })} />;
  }
}
