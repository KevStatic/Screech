import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextSenderState } from '../src/sender-state.js';
import type { RandomFill } from '../src/sender-state.js';
import type { SenderState } from '../src/types.js';

const ID = Uint8Array.from([1, 2, 3, 4]);
const fixedFill =
  (bytes: number[]): RandomFill =>
  (buffer) => {
    buffer.set(bytes);
    return buffer;
  };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nextSenderState', () => {
  it('returns a fresh 4-byte Sender_ID and Counter 0 with no previous state', () => {
    const r = nextSenderState(undefined, fixedFill([9, 8, 7, 6]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.value.senderId)).toEqual([9, 8, 7, 6]);
    expect(r.value.counter).toBe(0);
  });

  it('works with the default random source', () => {
    const r = nextSenderState();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.senderId.length).toBe(4);
    expect(r.value.counter).toBe(0);
  });

  it('keeps the Sender_ID and increments the Counter below 65535', () => {
    const r = nextSenderState({ senderId: ID, counter: 41 }, () => {
      throw new Error('must not draw');
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.value.senderId)).toEqual([1, 2, 3, 4]);
    expect(r.value.counter).toBe(42);
    expect(r.value.senderId).not.toBe(ID);
  });

  it('increments to 65535 from 65534 without rotating', () => {
    const r = nextSenderState({ senderId: ID, counter: 65534 });
    expect(r.ok && r.value.counter).toBe(65535);
  });

  it('rolls over at 65535 with a new Sender_ID and Counter 0', () => {
    const r = nextSenderState({ senderId: ID, counter: 65535 }, fixedFill([5, 6, 7, 8]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.value.senderId)).toEqual([5, 6, 7, 8]);
    expect(r.value.counter).toBe(0);
  });

  it('forces a different ID at rollover when the random source returns the old ID', () => {
    const r = nextSenderState({ senderId: ID, counter: 65535 }, fixedFill([1, 2, 3, 4]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.value.senderId)).toEqual([0, 2, 3, 4]);
    expect(r.value.counter).toBe(0);
  });

  it('returns invalid-counter for out-of-range or non-integer counters', () => {
    for (const counter of [-1, 65536, 1.5, NaN, '3', null]) {
      const r = nextSenderState({ senderId: ID, counter } as unknown as SenderState);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-counter');
    }
  });

  it('returns invalid-sender-id for wrong-length or non-Uint8Array IDs', () => {
    for (const senderId of [new Uint8Array(3), new Uint8Array(5), [1, 2, 3, 4], 'abcd', undefined]) {
      const r = nextSenderState({ senderId, counter: 0 } as unknown as SenderState);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-sender-id');
    }
  });

  it('checks Sender_ID before Counter', () => {
    const r = nextSenderState({ senderId: new Uint8Array(2), counter: -1 });
    expect(!r.ok && r.error.code).toBe('invalid-sender-id');
  });

  it('returns crypto-unavailable when getRandomValues throws', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: () => {
        throw new Error('boom');
      },
    });
    const r = nextSenderState();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('crypto-unavailable');
    const r2 = nextSenderState({ senderId: ID, counter: 65535 });
    expect(!r2.ok && r2.error.code).toBe('crypto-unavailable');
  });

  it('returns crypto-unavailable when getRandomValues is removed', () => {
    vi.stubGlobal('crypto', {});
    const r = nextSenderState();
    expect(!r.ok && r.error.code).toBe('crypto-unavailable');
  });

  it('returns crypto-unavailable when an injected fill throws', () => {
    const r = nextSenderState(undefined, () => {
      throw new Error('boom');
    });
    expect(!r.ok && r.error.code).toBe('crypto-unavailable');
  });

  it('restores the real random source after stubs are removed', () => {
    expect(nextSenderState().ok).toBe(true);
  });

  it('returns a synchronous result, not a thenable', () => {
    for (const r of [
      nextSenderState(),
      nextSenderState({ senderId: ID, counter: 1 }),
      nextSenderState({ senderId: ID, counter: -1 }),
    ]) {
      expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
      expect(r).not.toBeInstanceOf(Promise);
    }
  });
});
