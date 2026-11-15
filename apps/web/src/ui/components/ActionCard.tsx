import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';
import type { Payload } from '@screech/core';
import { parseContactText } from '../../logic/contact';
import { isSafeToOpen } from '../../logic/url-safety';
import { buildVCard } from '../../logic/vcard';
import { buildWifiQrString } from '../../logic/wifi-qr';

export interface ActionCardProps {
  readonly payload: Payload;
}

type CopyState = 'idle' | 'copied' | 'failed';
type QrState = 'pending' | 'drawn' | 'failed';

const SECURITY_LABEL = { wpa: 'WPA', wep: 'WEP', open: 'Open (no password)' } as const;

function Row(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <p className="note">
      <span className="label">{props.label}: </span>
      <span>{props.children}</span>
    </p>
  );
}

function UrlCard({ url }: { readonly url: string }) {
  const safe = isSafeToOpen(url);
  return (
    <div className="action-card" data-type="url">
      <Row label="Link">{url}</Row>
      {safe ? (
        <button
          type="button"
          className="btn hit"
          onClick={() => {
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
        >
          Open link
        </button>
      ) : (
        <p className="note is-error" role="alert">
          This link is not safe to open. Only web links starting with http or https can be opened.
        </p>
      )}
    </div>
  );
}

/** Copies to the clipboard. Never throws; reports the outcome through `done`. */
function copyText(value: string, done: (state: CopyState) => void): void {
  try {
    const write = navigator.clipboard?.writeText(value);
    if (write === undefined) {
      done('failed');
      return;
    }
    write.then(
      () => done('copied'),
      () => done('failed'),
    );
  } catch {
    done('failed');
  }
}
function WifiQr(props: {
  readonly ssid: string;
  readonly password: string;
  readonly security: 'open' | 'wpa' | 'wep';
  readonly onFailed: () => void;
}) {
  const { ssid, password, security, onFailed } = props;
  const [qr, setQr] = useState<QrState>('pending');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const fail = (): void => {
      if (cancelled) return;
      setQr('failed');
      onFailed();
    };
    if (canvas === null) {
      fail();
      return undefined;
    }
    try {
      QRCode.toCanvas(canvas, buildWifiQrString({ ssid, password, security }), { margin: 2 }).then(
        () => {
          if (!cancelled) setQr('drawn');
        },
        fail,
      );
    } catch {
      fail();
    }
    return () => {
      cancelled = true;
    };
  }, [ssid, password, security, onFailed]);
  if (qr === 'failed') {
    return (
      <p className="note is-error" role="alert">
        The QR code could not be drawn. The network details are shown above.
      </p>
    );
  }
  return <canvas ref={canvasRef} className="wifi-qr" role="img" aria-label={`QR code to join ${ssid}`} />;
}
function WifiCard(props: {
  readonly ssid: string;
  readonly password: string;
  readonly security: 'open' | 'wpa' | 'wep';
}) {
  const { ssid, password, security } = props;
  const [copy, setCopy] = useState<CopyState>('idle');
  const [showQr, setShowQr] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const isOpen = security === 'open';
  const onQrFailed = useCallback(() => setQrFailed(true), []);
  return (
    <div className="action-card" data-type="wifi">
      <p className="action-ssid wrap" data-testid="wifi-ssid">
        {ssid}
      </p>
      <Row label="Security">{SECURITY_LABEL[security]}</Row>
      {!isOpen && (
        <>
          <button type="button" className="btn hit" onClick={() => copyText(password, setCopy)}>
            Copy password
          </button>
          {copy === 'copied' && (
            <p className="note" role="status">
              Password copied.
            </p>
          )}
          {(copy === 'failed' || qrFailed) && (
            <Row label="Password">
              <span style={{ userSelect: 'all' }}>{password}</span>
            </Row>
          )}
          {copy === 'failed' && (
            <p className="note is-error" role="alert">
              Copying failed. Select the password above and copy it by hand.
            </p>
          )}
        </>
      )}
      <p className="note" data-testid="wifi-steps">
        {isOpen
          ? `Open Wi-Fi settings, choose ${ssid}.`
          : `Open Wi-Fi settings, choose ${ssid}, paste the password.`}
      </p>
      <button
        type="button"
        className="btn secondary hit"
        aria-expanded={showQr}
        onClick={() => setShowQr((v) => !v)}
      >
        {showQr ? 'Hide QR' : 'Show QR for someone else'}
      </button>
      {showQr ? <WifiQr ssid={ssid} password={password} security={security} onFailed={onQrFailed} /> : null}
    </div>
  );
}
function TextCard(props: { readonly type: string; readonly text: string }) {
  const [copy, setCopy] = useState<CopyState>('idle');
  return (
    <div className="action-card" data-type={props.type}>
      <button type="button" className="btn hit" onClick={() => copyText(props.text, setCopy)}>
        Copy text
      </button>
      {copy === 'copied' && (
        <p className="note" role="status">
          Text copied.
        </p>
      )}
      {copy === 'failed' && (
        <>
          <p className="note is-error" role="alert">
            Copying failed. Select the text below and copy it by hand.
          </p>
          <p className="note" style={{ userSelect: 'all' }}>
            {props.text}
          </p>
        </>
      )}
    </div>
  );
}
function ContactCard({ text }: { readonly text: string }) {
  const parsed = parseContactText(text);
  if (!parsed.ok) {
    return (
      <div className="action-card" data-type="contact">
        <p className="note is-error" role="alert">
          This contact could not be read. The raw text is shown below.
        </p>
        <p className="note">{text}</p>
      </div>
    );
  }
  const { name, phone, email } = parsed.fields;
  const download = (): void => {
    const blob = new Blob([buildVCard(parsed.fields)], { type: 'text/vcard' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'contact.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };
  return (
    <div className="action-card" data-type="contact">
      <Row label="Name">{name}</Row>
      {phone !== '' && <Row label="Phone">{phone}</Row>}
      {email !== '' && <Row label="Email">{email}</Row>}
      <button type="button" className="btn hit" onClick={download}>
        Download contact (.vcf)
      </button>
    </div>
  );
}

/** Shows a received payload and the one action that suits it. All received text is rendered as React text nodes. */
export default function ActionCard({ payload }: ActionCardProps) {
  switch (payload.type) {
    case 'url':
      return <UrlCard url={payload.url} />;
    case 'wifi':
      return <WifiCard ssid={payload.ssid} password={payload.password} security={payload.security} />;
    case 'contact':
      return <ContactCard text={payload.text} />;
    case 'text':
    case 'checkin':
    case 'hunt-clue':
      return <TextCard type={payload.type} text={payload.text} />;
  }
}
