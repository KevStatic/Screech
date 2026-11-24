import type { ReactElement } from 'react';
import type { QrCardModel } from '../../logic/qr-cards';
import SetupQr from './SetupQr';

export interface QrCardProps {
  model: QrCardModel;
}

/**
 * One Spirit's card: the setup QR, "Spirit N of M", the name, the Hunt_ID and,
 * when present, the "Hide at:" line. Every text value is a React text node, so
 * nothing typed by the host is parsed as HTML. Used on screen and in print.
 */
export default function QrCard({ model }: QrCardProps): ReactElement {
  return (
    <article className="qr-card" aria-label={model.alt}>
      <SetupQr link={model.link} alt={model.alt} label={`Spirit ${model.index}`} />
      <h3 className="qr-card-title">{model.title}</h3>
      <p className="qr-card-name">{model.name}</p>
      <p className="qr-card-id">{model.huntId}</p>
      {model.hideAtLine !== null ? <p className="qr-card-hide">{model.hideAtLine}</p> : null}
    </article>
  );
}
