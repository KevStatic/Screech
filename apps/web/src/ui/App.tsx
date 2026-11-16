import { useState, type ReactElement } from 'react';
import { useAudioSession } from './hooks/useAudioSession';
import { useDraft } from './hooks/useDraft';
import { useFlow } from './hooks/useFlow';
import { useHauntBridge } from './hooks/useHaunt';
import Awaken from './screens/Awaken';
import Garbled from './screens/Garbled';
import Listen from './screens/Listen';
import Reveal from './screens/Reveal';
import Screeching from './screens/Screeching';
import Sealed from './screens/Sealed';
import Speak, { type TransmissionOutcome } from './screens/Speak';

const MSG_NO_TRANSMISSION = 'The sound did not leave the speaker.';

/**
 * Screen switch. All send and listen exclusion lives in the flow reducer; this component
 * only routes. Awaken is the only screen at start.
 */
export default function App(): ReactElement {
  const flow = useFlow();
  const audio = useAudioSession();
  const draft = useDraft();
  useHauntBridge(flow, audio);
  const [outcome, setOutcome] = useState<TransmissionOutcome | null>(null);

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
  }
}
