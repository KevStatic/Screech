/** Samples per chunk handed to the decoder. */
export const CHUNK_SIZE = 4096;

export interface ChunkerState {
  /** Samples waiting for the next chunk. Length is always below CHUNK_SIZE. */
  readonly pending: Float32Array;
}

export const EMPTY_CHUNKER: ChunkerState = { pending: new Float32Array(0) };

/**
 * Adds a block of samples and cuts out every full chunk.
 * Chunks come back in order, each exactly CHUNK_SIZE long, with no sample lost or repeated.
 * Every returned array is a copy, so the caller may reuse `block` afterwards.
 */
export function pushSamples(
  state: ChunkerState,
  block: Float32Array,
): { readonly state: ChunkerState; readonly chunks: readonly Float32Array[] } {
  const total = state.pending.length + block.length;
  const chunkCount = Math.floor(total / CHUNK_SIZE);

  if (chunkCount === 0) {
    const pending = new Float32Array(total);
    pending.set(state.pending, 0);
    pending.set(block, state.pending.length);
    return { state: { pending }, chunks: [] };
  }

  const joined = new Float32Array(total);
  joined.set(state.pending, 0);
  joined.set(block, state.pending.length);

  const chunks: Float32Array[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(joined.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  return { state: { pending: joined.slice(chunkCount * CHUNK_SIZE) }, chunks };
}
