import { COUNTER_MAX, SENDER_ID_LENGTH } from './constants.js';
import { isCounter, isSenderId } from './guards.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import type { SenderState } from './types.js';

/** Fills `buffer` with random bytes and returns it. */
export type RandomFill = (buffer: Uint8Array) => Uint8Array;

const defaultFill: RandomFill = (buffer) => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c === undefined || typeof c.getRandomValues !== 'function') {
    throw new Error('getRandomValues is unavailable');
  }
  c.getRandomValues(buffer);
  return buffer;
};

function unavailable(): Result<SenderState> {
  return err({ code: 'crypto-unavailable', message: 'Random source is unavailable' });
}

/** Draws a fresh 4-byte Sender_ID, or returns undefined if the source fails. */
function drawId(fill: RandomFill): Uint8Array | undefined {
  try {
    const buffer = new Uint8Array(SENDER_ID_LENGTH);
    const filled = fill(buffer);
    const source = isSenderId(filled) ? filled : buffer;
    return new Uint8Array(source);
  } catch {
    return undefined;
  }
}

/**
 * Returns the next Sender_State. Synchronous and never throws.
 * Without `previous`: fresh Sender_ID, Counter 0. Below 65535: same ID, Counter + 1.
 * At 65535: a fresh ID that differs from the old one, Counter 0.
 */
export function nextSenderState(
  previous?: SenderState,
  fill: RandomFill = defaultFill,
): Result<SenderState> {
  try {
    if (previous === undefined) {
      const senderId = drawId(fill);
      return senderId === undefined ? unavailable() : ok({ senderId, counter: 0 });
    }

    const prev: unknown = previous;
    if (typeof prev !== 'object' || prev === null) {
      return err({ code: 'invalid-sender-id', message: 'Sender_State must be an object' });
    }
    const oldId: unknown = (prev as { senderId?: unknown }).senderId;
    if (!isSenderId(oldId)) {
      return err({ code: 'invalid-sender-id', message: 'Sender_ID must be 4 bytes' });
    }
    const counter: unknown = (prev as { counter?: unknown }).counter;
    if (!isCounter(counter)) {
      return err({ code: 'invalid-counter', message: 'Counter must be an integer 0..65535' });
    }

    if (counter < COUNTER_MAX) {
      return ok({ senderId: new Uint8Array(oldId), counter: counter + 1 });
    }

    const senderId = drawId(fill);
    if (senderId === undefined) return unavailable();
    let same = true;
    for (let i = 0; i < SENDER_ID_LENGTH; i++) {
      if (senderId[i] !== oldId[i]) {
        same = false;
        break;
      }
    }
    if (same) senderId[0] = (senderId[0] ?? 0) ^ 0x01;
    return ok({ senderId, counter: 0 });
  } catch {
    return err({ code: 'invalid-sender-id', message: 'Sender_State could not be read' });
  }
}
