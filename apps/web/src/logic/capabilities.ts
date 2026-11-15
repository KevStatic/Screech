export interface Env {
  readonly hasWasm: boolean;
  readonly hasWebAudio: boolean;
  readonly isSecureContext: boolean;
  readonly hasGetUserMedia: boolean;
}

export type MissingFeature = 'WebAssembly' | 'Web Audio' | 'secure context (HTTPS)';

export type MicSupport = 'ok' | 'insecure-context' | 'no-getusermedia';

/** Names of the required features the environment lacks. Empty only when all are present. */
export function missingFeatures(env: Env): readonly MissingFeature[] {
  const missing: MissingFeature[] = [];
  if (!env.hasWasm) missing.push('WebAssembly');
  if (!env.hasWebAudio) missing.push('Web Audio');
  if (!env.isSecureContext) missing.push('secure context (HTTPS)');
  return missing;
}

/** Which cause blocks the microphone. An insecure context is reported before a missing getUserMedia. */
export function micSupport(env: Env): MicSupport {
  if (!env.isSecureContext) return 'insecure-context';
  if (!env.hasGetUserMedia) return 'no-getusermedia';
  return 'ok';
}
