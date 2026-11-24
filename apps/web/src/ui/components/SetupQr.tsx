import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import QRCode from 'qrcode';
import { layoutQr, QR_QUIET_MODULES } from '../../logic/qr-layout';

export interface SetupQrProps {
  /** The full clue link to encode. */
  link: string;
  /** Text alternative for the drawing, from the card model. */
  alt: string;
  /** Plain-words label used in the failure message, e.g. "Spirit 2". Optional. */
  label?: string;
}

const DARK = '#050806';
const LIGHT = '#e9e4d4';

interface Matrix {
  readonly size: number;
  readonly data: ArrayLike<number>;
}

/** Build one SVG path: a unit square per dark module, offset by the quiet zone. */
export function matrixPath(m: Matrix, quiet: number = QR_QUIET_MODULES): string {
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.data[y * m.size + x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return parts.join('');
}

function readMatrix(link: string): Matrix | null {
  try {
    const qr = QRCode.create(link, { errorCorrectionLevel: 'M' });
    return { size: qr.modules.size, data: qr.modules.data };
  } catch {
    return null;
  }
}

function currentDpr(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
}

/**
 * Inline SVG QR code. Redraws when `link` changes. If the code cannot be built or
 * does not fit at a scannable size, shows the link as selectable text instead.
 * No network calls.
 */
export default function SetupQr({ link, alt, label }: SetupQrProps): ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number>(0);
  const [dpr, setDpr] = useState<number>(currentDpr());

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = (): void => {
      setAvailable(el.clientWidth);
      setDpr(currentDpr());
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const matrix = useMemo(() => readMatrix(link), [link]);
  const layout = matrix ? layoutQr(matrix.size, available, dpr) : null;
  const path = useMemo(() => (matrix ? matrixPath(matrix) : ''), [matrix]);

  const failed = matrix === null || (layout !== null && available > 0 && !layout.fits);

  return (
    <div ref={boxRef} className="qr-slot" style={{ width: '100%' }}>
      {!failed && matrix && layout && layout.fits ? (
        <svg
          role="img"
          aria-label={alt}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${matrix.size + 2 * QR_QUIET_MODULES} ${matrix.size + 2 * QR_QUIET_MODULES}`}
          width={layout.cssSize}
          height={layout.cssSize}
          shapeRendering="crispEdges"
          style={{ width: layout.cssSize, height: layout.cssSize, maxWidth: 'none', background: LIGHT }}
        >
          <rect width="100%" height="100%" fill={LIGHT} />
          <path d={path} fill={DARK} style={{ fill: DARK }} shapeRendering="crispEdges" />
        </svg>
      ) : null}
      {failed ? (
        <div role="group" aria-label={alt}>
          <p className="hunt-message is-error">
            {label ? `The QR code for ${label} could not be drawn.` : 'The QR code could not be drawn.'}{' '}
            Copy the link below instead.
          </p>
          <p className="qr-link">{link}</p>
        </div>
      ) : null}
    </div>
  );
}
