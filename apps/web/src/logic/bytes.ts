/**
 * Copies a ggwave result view into a fresh Uint8Array.
 * The view points into WASM memory, which can be overwritten by the next call,
 * so the copy must not share its buffer.
 */
export function ggwaveViewToBytes(view: Int8Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.length).slice();
}

/**
 * Reinterprets ggwave waveform bytes as 32-bit float samples.
 * The bytes are copied first so the result owns an aligned buffer starting at offset 0.
 */
export function waveformFromBytes(bytes: Int8Array): Float32Array {
  const copy = bytes.slice();
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}
