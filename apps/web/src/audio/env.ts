import type { Env } from '../logic/capabilities';

interface AudioGlobals {
  readonly AudioContext?: unknown;
  readonly webkitAudioContext?: unknown;
}

/** Reads the browser capabilities once from window and navigator. */
export function readCapabilities(): Env {
  const audio = window as unknown as AudioGlobals;
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    hasWasm: typeof WebAssembly === 'object' && WebAssembly !== null,
    hasWebAudio:
      typeof audio.AudioContext === 'function' || typeof audio.webkitAudioContext === 'function',
    isSecureContext: window.isSecureContext === true,
    hasGetUserMedia: md !== undefined && typeof md.getUserMedia === 'function',
  };
}
