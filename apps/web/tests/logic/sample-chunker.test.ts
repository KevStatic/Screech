import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, EMPTY_CHUNKER, pushSamples } from '../../src/logic/sample-chunker';

function ramp(start: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = start + i;
  return out;
}

describe('pushSamples', () => {
  it('empty input gives no chunks and keeps the state empty', () => {
    const r = pushSamples(EMPTY_CHUNKER, new Float32Array(0));
    expect(r.chunks).toHaveLength(0);
    expect(r.state.pending).toHaveLength(0);
  });

  it('empty input keeps existing leftover samples', () => {
    const first = pushSamples(EMPTY_CHUNKER, ramp(0, 10));
    const r = pushSamples(first.state, new Float32Array(0));
    expect(r.chunks).toHaveLength(0);
    expect(Array.from(r.state.pending)).toEqual(Array.from(ramp(0, 10)));
  });

  it('exactly 4096 samples give one chunk and nothing left over', () => {
    const r = pushSamples(EMPTY_CHUNKER, ramp(0, CHUNK_SIZE));
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]).toHaveLength(CHUNK_SIZE);
    expect(r.state.pending).toHaveLength(0);
  });

  it('an exact multiple of 4096 gives that many chunks and no leftover', () => {
    const r = pushSamples(EMPTY_CHUNKER, ramp(0, CHUNK_SIZE * 3));
    expect(r.chunks).toHaveLength(3);
    expect(r.state.pending).toHaveLength(0);
  });

  it('fewer than 4096 samples are held back', () => {
    const r = pushSamples(EMPTY_CHUNKER, ramp(0, CHUNK_SIZE - 1));
    expect(r.chunks).toHaveLength(0);
    expect(r.state.pending).toHaveLength(CHUNK_SIZE - 1);
  });

  it('a block spanning several chunks keeps order and carries the remainder', () => {
    const total = CHUNK_SIZE * 2 + 100;
    const r = pushSamples(EMPTY_CHUNKER, ramp(0, total));
    expect(r.chunks).toHaveLength(2);
    expect(r.chunks[0][0]).toBe(0);
    expect(r.chunks[0][CHUNK_SIZE - 1]).toBe(CHUNK_SIZE - 1);
    expect(r.chunks[1][0]).toBe(CHUNK_SIZE);
    expect(r.chunks[1][CHUNK_SIZE - 1]).toBe(CHUNK_SIZE * 2 - 1);
    expect(r.state.pending).toHaveLength(100);
    expect(r.state.pending[0]).toBe(CHUNK_SIZE * 2);
    expect(r.state.pending[99]).toBe(total - 1);
  });

  it('leftover is carried over and completes the next chunk', () => {
    const a = pushSamples(EMPTY_CHUNKER, ramp(0, 3000));
    expect(a.chunks).toHaveLength(0);
    const b = pushSamples(a.state, ramp(3000, 2000));
    expect(b.chunks).toHaveLength(1);
    expect(Array.from(b.chunks[0])).toEqual(Array.from(ramp(0, CHUNK_SIZE)));
    expect(Array.from(b.state.pending)).toEqual(Array.from(ramp(CHUNK_SIZE, 904)));
  });

  it('returned chunks are copies, not views of the input block', () => {
    const block = ramp(0, CHUNK_SIZE);
    const r = pushSamples(EMPTY_CHUNKER, block);
    block.fill(-1);
    expect(r.chunks[0][0]).toBe(0);
  });
});
