/** Registered name of the capture processor. */
export const CAPTURE_PROCESSOR_NAME = 'screech-capture';

/**
 * Source of the AudioWorklet processor. It runs in the worklet scope, so it is a plain string
 * loaded from a Blob URL. Each input block is copied and posted to the main thread, because the
 * browser reuses the input buffer between calls.
 */
export const CAPTURE_WORKLET_SOURCE = `
class ScreechCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('${CAPTURE_PROCESSOR_NAME}', ScreechCapture);
`;
