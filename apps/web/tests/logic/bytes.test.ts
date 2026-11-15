import { describe, expect, it } from 'vitest';
import { ggwaveViewToBytes, waveformFromBytes } from '../../src/logic/bytes';

describe('ggwaveViewToBytes', () => {
  it('respects a non-zero byteOffset and length', () => {
    const backing = new Int8Array([9, 9, 1, 2, 3, 9]);
    const view = new Int8Array(backing.buffer, 2, 3);
    const out = ggwaveViewToBytes(view);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out.byteOffset).toBe(0);
    expect(out.buffer.byteLength).toBe(3);
  });

  it('empty view gives an empty array', () => {
    expect(ggwaveViewToBytes(new Int8Array(0)).length).toBe(0);
  });

  it('maps negative Int8 values to 128..255', () => {
    const out = ggwaveViewToBytes(new Int8Array([-1, -128, -127, 127, 0]));
    expect(Array.from(out)).toEqual([255, 128, 129, 127, 0]);
  });

  it('copy does not share the source buffer', () => {
    const src = new Int8Array([1, 2, 3]);
    const out = ggwaveViewToBytes(src);
    expect(out.buffer).not.toBe(src.buffer);
    src[0] = 100;
    expect(out[0]).toBe(1);
  });
});

describe('waveformFromBytes', () => {
  it('reads the bytes as float32 samples', () => {
    const floats = new Float32Array([0.5, -1, 0.25]);
    const bytes = new Int8Array(floats.buffer);
    expect(Array.from(waveformFromBytes(bytes))).toEqual([0.5, -1, 0.25]);
  });

  it('works on a view with a non-aligned byteOffset', () => {
    const floats = new Float32Array([0.5, -1]);
    const backing = new Int8Array(floats.byteLength + 1);
    backing.set(new Int8Array(floats.buffer), 1);
    const out = waveformFromBytes(new Int8Array(backing.buffer, 1, floats.byteLength));
    expect(Array.from(out)).toEqual([0.5, -1]);
  });

  it('copies: later changes to the input do not alter the result', () => {
    const bytes = new Int8Array(new Float32Array([1, 2]).buffer);
    const out = waveformFromBytes(bytes);
    bytes.fill(0);
    expect(Array.from(out)).toEqual([1, 2]);
    expect(out.buffer).not.toBe(bytes.buffer);
    expect(out.byteOffset).toBe(0);
  });

  it('empty input gives an empty array', () => {
    expect(waveformFromBytes(new Int8Array(0)).length).toBe(0);
  });
});
