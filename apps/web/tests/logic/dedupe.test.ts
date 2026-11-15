import { describe, it, expect } from 'vitest';
import { dedupeStep } from '../../src/logic/dedupe';

describe('dedupeStep', () => {
  it('shows the first event for a key', () => {
    expect(dedupeStep(new Map(), 'a', 0).show).toBe(true);
  });

  it('suppresses the same key at 4999 ms', () => {
    const first = dedupeStep(new Map(), 'a', 1000);
    expect(dedupeStep(first.state, 'a', 1000 + 4999).show).toBe(false);
  });

  it('shows the same key again at 5000 ms', () => {
    const first = dedupeStep(new Map(), 'a', 1000);
    expect(dedupeStep(first.state, 'a', 1000 + 5000).show).toBe(true);
  });

  it('treats other keys independently', () => {
    const first = dedupeStep(new Map(), 'a', 1000);
    expect(dedupeStep(first.state, 'b', 1001).show).toBe(true);
  });

  it('does not mutate the input map', () => {
    const input = new Map<string, number>([['a', 0]]);
    dedupeStep(input, 'b', 10);
    expect([...input]).toEqual([['a', 0]]);
  });
});
