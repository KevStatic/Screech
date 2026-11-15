import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CHUNK_SIZE, EMPTY_CHUNKER, pushSamples } from '../../src/logic/sample-chunker';
import type { ChunkerState } from '../../src/logic/sample-chunker';
import { sampleBlocks } from './arbitraries';

function concat(parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('sample chunker properties', () => {
  // Feature: spirit-box-app, Property 12: Sample chunker conserves samples
  // **Validates: Requirements 9.15, 9.16**
  it('Property 12: Sample chunker conserves samples', () => {
    fc.assert(
      fc.property(sampleBlocks, (blocks) => {
        let state: ChunkerState = EMPTY_CHUNKER;
        const emitted: Float32Array[] = [];
        for (const block of blocks) {
          const r = pushSamples(state, block);
          state = r.state;
          emitted.push(...r.chunks);
        }

        for (const chunk of emitted) expect(chunk.length).toBe(CHUNK_SIZE);
        expect(state.pending.length).toBeLessThan(CHUNK_SIZE);

        const output = concat([...emitted, state.pending]);
        const input = concat(blocks);
        expect(output.length).toBe(input.length);
        for (let i = 0; i < input.length; i++) {
          if (!Object.is(output[i], input[i])) throw new Error(`sample ${i} differs`);
        }
      }),
      { numRuns: 100 },
    );
  });
});
