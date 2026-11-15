/** Dev-only range lab. Shown only when the page URL has ?lab=1. */
export const LAB_VOLUMES = [50, 75, 100] as const;
export const LAB_PROTOCOLS = ['fast', 'normal'] as const;
export type LabVolume = (typeof LAB_VOLUMES)[number];
export type LabProtocol = (typeof LAB_PROTOCOLS)[number];
export interface LabSettings {
  readonly volume: LabVolume;
  readonly protocol: LabProtocol;
}
/** The product defaults. Nothing changes unless the lab is open and a selector is moved. */
export const LAB_DEFAULTS: LabSettings = { volume: 50, protocol: 'fast' };
/** True only for an exact lab=1 query parameter. `search` is location.search. */
export function isLabEnabled(search: string): boolean {
  return new URLSearchParams(search).get('lab') === '1';
}
