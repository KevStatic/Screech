import { describe, expect, it } from 'vitest';
import { nextSenderState } from '../src/sender-state.js';
import type { RandomFill } from '../src/sender-state.js';
import type { SenderState } from '../src/types.js';

describe('nextSenderState no-repeat', () => {
  // Validates: Requirements 9.4, 12.13
  it('never repeats a (senderId, counter) pair over 70,000 consecutive calls', () => {
    let drawn = 0;
    const fill: RandomFill = (buffer) => {
      new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(0, drawn, false);
      drawn += 1;
      return buffer;
    };

    const seen = new Set<string>();
    let state: SenderState | undefined;
    for (let i = 0; i < 70_000; i++) {
      const result = nextSenderState(state, fill);
      if (!result.ok) {
        throw new Error(`call ${i} failed with ${result.error.code}`);
      }
      state = result.value;
      const key = `${Array.from(state.senderId).join(',')}:${state.counter}`;
      if (seen.has(key)) {
        throw new Error(`repeat at call ${i}: ${key}`);
      }
      seen.add(key);
    }

    expect(seen.size).toBe(70_000);
    expect(drawn).toBe(2); // initial draw plus one rollover at counter 65535
  });
});
