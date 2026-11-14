import { runInNewContext } from 'node:vm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isCounter, isRoomKey, isSenderId, isUint8Array } from '../src/guards.js';
import { err, ok } from '../src/result.js';
import { anythingArb } from './arbitraries.js';
import { NUM_RUNS } from './helpers.js';

describe('isUint8Array', () => {
  it('accepts Uint8Array instances', () => {
    expect(isUint8Array(new Uint8Array(0))).toBe(true);
    expect(isUint8Array(new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('accepts a Uint8Array from another realm', () => {
    const foreign: unknown = runInNewContext('new Uint8Array([1, 2, 3])');
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(isUint8Array(foreign)).toBe(true);
  });

  it('rejects other typed arrays and buffers', () => {
    expect(isUint8Array(new Int8Array(4))).toBe(false);
    expect(isUint8Array(new Uint8ClampedArray(4))).toBe(false);
    expect(isUint8Array(new Uint16Array(4))).toBe(false);
    expect(isUint8Array(new Float32Array(4))).toBe(false);
    expect(isUint8Array(new ArrayBuffer(4))).toBe(false);
    expect(isUint8Array(new DataView(new ArrayBuffer(4)))).toBe(false);
  });

  it('rejects null, undefined and non-binary values', () => {
    expect(isUint8Array(null)).toBe(false);
    expect(isUint8Array(undefined)).toBe(false);
    expect(isUint8Array([1, 2, 3])).toBe(false);
    expect(isUint8Array('abcd')).toBe(false);
    expect(isUint8Array({})).toBe(false);
    expect(isUint8Array(0)).toBe(false);
  });
});

describe('isSenderId', () => {
  it('accepts exactly 4 bytes', () => {
    expect(isSenderId(new Uint8Array(4))).toBe(true);
  });

  it('rejects other lengths and types', () => {
    expect(isSenderId(new Uint8Array(0))).toBe(false);
    expect(isSenderId(new Uint8Array(3))).toBe(false);
    expect(isSenderId(new Uint8Array(5))).toBe(false);
    expect(isSenderId(new Uint8Array(16))).toBe(false);
    expect(isSenderId(new Uint16Array(4))).toBe(false);
    expect(isSenderId([0, 0, 0, 0])).toBe(false);
    expect(isSenderId(null)).toBe(false);
    expect(isSenderId(undefined)).toBe(false);
  });
});

describe('isCounter', () => {
  it('accepts integers 0..65535', () => {
    expect(isCounter(0)).toBe(true);
    expect(isCounter(1)).toBe(true);
    expect(isCounter(65535)).toBe(true);
  });

  it('rejects out-of-range, non-integer and non-number values', () => {
    expect(isCounter(-1)).toBe(false);
    expect(isCounter(65536)).toBe(false);
    expect(isCounter(1.5)).toBe(false);
    expect(isCounter(Number.NaN)).toBe(false);
    expect(isCounter(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCounter('1')).toBe(false);
    expect(isCounter('')).toBe(false);
    expect(isCounter(null)).toBe(false);
    expect(isCounter(undefined)).toBe(false);
    expect(isCounter(1n)).toBe(false);
  });
});

describe('isRoomKey', () => {
  it('accepts exactly 16 bytes', () => {
    expect(isRoomKey(new Uint8Array(16))).toBe(true);
  });

  it('rejects other lengths and types', () => {
    expect(isRoomKey(new Uint8Array(0))).toBe(false);
    expect(isRoomKey(new Uint8Array(15))).toBe(false);
    expect(isRoomKey(new Uint8Array(17))).toBe(false);
    expect(isRoomKey(new Uint8Array(4))).toBe(false);
    expect(isRoomKey(new Uint16Array(16))).toBe(false);
    expect(isRoomKey('0123456789abcdef')).toBe(false);
    expect(isRoomKey(null)).toBe(false);
    expect(isRoomKey(undefined)).toBe(false);
  });
});

describe('ok and err', () => {
  it('ok wraps a value', () => {
    const value = new Uint8Array([1]);
    const result = ok(value);
    expect(result).toEqual({ ok: true, value });
    expect(result.value).toBe(value);
  });

  it('err wraps an error', () => {
    const error = { code: 'truncated', message: 'too short' } as const;
    const result = err(error);
    expect(result).toEqual({ ok: false, error });
    expect(result.error).toBe(error);
  });
});

describe('guards are total', () => {
  // Feature: screech-protocol, Property 20: Totality
  // **Validates: Requirements 8.9, 8.12, 8.13, 10.7**
  it('never throw for any value', () => {
    fc.assert(
      fc.property(anythingArb, (value) => {
        for (const guard of [isUint8Array, isSenderId, isCounter, isRoomKey]) {
          expect(typeof guard(value)).toBe('boolean');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
