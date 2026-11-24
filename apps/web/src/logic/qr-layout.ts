/**
 * Setup QR layout: whole device pixels per module, so the code stays crisp.
 * Pure functions, no React and no DOM.
 */

export const QR_QUIET_MODULES = 4;
export const QR_MIN_CSS_PX_PER_MODULE = 3;
export const QR_MAX_CSS_PX_PER_MODULE = 8;
export const QR_MIN_CSS_SIZE = 160;

export interface QrLayout {
  readonly fits: boolean;
  /** Integer device pixels per module. */
  readonly modulePx: number;
  /** (moduleCount + 2 * quiet) * modulePx, device pixels. */
  readonly sizePx: number;
  /** sizePx / devicePixelRatio. */
  readonly cssSize: number;
}

const NO_FIT: QrLayout = { fits: false, modulePx: 0, sizePx: 0, cssSize: 0 };

/**
 * modulePx = floor(min(available / (n + 8), 8) * dpr).
 * `fits` is true when modulePx / dpr >= 3 and cssSize >= 160.
 * Bad input (non-finite, non-positive) gives fits false and zero sizes.
 */
export function layoutQr(
  moduleCount: number,
  availableCssPx: number,
  devicePixelRatio: number,
): QrLayout {
  if (
    !Number.isFinite(moduleCount) ||
    !Number.isFinite(availableCssPx) ||
    !Number.isFinite(devicePixelRatio) ||
    moduleCount <= 0 ||
    availableCssPx <= 0 ||
    devicePixelRatio <= 0
  ) {
    return NO_FIT;
  }
  const totalModules = moduleCount + 2 * QR_QUIET_MODULES;
  const cssPerModule = Math.min(availableCssPx / totalModules, QR_MAX_CSS_PX_PER_MODULE);
  const modulePx = Math.floor(cssPerModule * devicePixelRatio);
  const sizePx = totalModules * modulePx;
  const cssSize = sizePx / devicePixelRatio;
  const fits =
    modulePx > 0 &&
    modulePx / devicePixelRatio >= QR_MIN_CSS_PX_PER_MODULE &&
    cssSize >= QR_MIN_CSS_SIZE;
  return { fits, modulePx, sizePx, cssSize };
}
