import {
  MIC_BLOCKED_MESSAGE,
  MIC_DENIED_MESSAGE,
  MIC_UNAVAILABLE_MESSAGE,
  type MicFailureReason,
} from '../logic/mic-messages';

export { MIC_BLOCKED_MESSAGE, MIC_DENIED_MESSAGE, MIC_UNAVAILABLE_MESSAGE };

export type MicResult =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly reason: MicFailureReason; readonly message: string };

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
