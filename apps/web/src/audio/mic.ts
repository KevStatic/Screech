export type MicResult =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly reason: 'denied' | 'blocked' | 'unavailable'; readonly message: string };

export const MIC_DENIED_MESSAGE =
  'The microphone was refused. Screech cannot hear without it. Allow it in your browser settings.';
export const MIC_BLOCKED_MESSAGE =
  "This page can't use the microphone here. Open the link in Safari or Chrome.";
export const MIC_UNAVAILABLE_MESSAGE =
  'The microphone could not be opened. No microphone was found, or another app is using it.';

const DENIAL_NAMES: readonly string[] = ['NotAllowedError', 'PermissionDeniedError'];

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { readonly name: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return '';
}

/** Requests the microphone with every browser audio filter off. Never throws. */
export async function openMic(): Promise<MicResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    return { ok: true, stream };
  } catch (error: unknown) {
    if (errorName(error) === 'SecurityError') {
      return { ok: false, reason: 'blocked', message: MIC_BLOCKED_MESSAGE };
    }
    if (DENIAL_NAMES.includes(errorName(error))) {
      return { ok: false, reason: 'denied', message: MIC_DENIED_MESSAGE };
    }
    return { ok: false, reason: 'unavailable', message: MIC_UNAVAILABLE_MESSAGE };
  }
}

/** Stops every track of the stream. */
export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
