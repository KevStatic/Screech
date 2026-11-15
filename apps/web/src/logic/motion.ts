/** localStorage key holding the saved Exorcise toggle. */
export const EXORCISE_KEY = 'screech.exorcise';

/** Only the exact string '1' means on. Anything else, including missing, is off. */
export function parseExorcise(raw: string | null | undefined): boolean {
  return raw === '1';
}

export function serializeExorcise(on: boolean): '1' | '0' {
  return on ? '1' : '0';
}

/** Motion is reduced when either the Exorcise toggle or the system setting asks for it. */
export function resolveReducedMotion(toggle: boolean, systemPrefersReduced: boolean): boolean {
  return toggle || systemPrefersReduced;
}
