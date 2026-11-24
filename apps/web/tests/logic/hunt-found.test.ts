import { describe, it, expect } from 'vitest';
import type { ClueFields } from '@screech/core';
import {
  counterHeading,
  counterRows,
  emptyFoundState,
  foundReducer,
  formatTimeTaken,
  timeTakenSeconds,
} from '../../src/logic/hunt-found';

const c = (index: number, over: Partial<ClueFields> = {}): ClueFields => ({
  huntId: 'ABC234',
  total: 3,
  index,
  name: `Ghost ${index}`,
  clue: 'look up',
  ...over,
});
const empty = () => emptyFoundState({ huntId: 'ABC234', total: 3 });

describe('hunt-found', () => {
  it('stamps firstFoundAt on the first find only', () => {
    const a = foundReducer(empty(), c(2), 100);
    expect(a.firstFoundAt).toBe(100);
    expect(a.completedAt).toBeNull();
    const b = foundReducer(a, c(1), 500);
    expect(b.firstFoundAt).toBe(100);
    expect(b.found.map((e) => e.index)).toEqual([1, 2]);
  });

  it('stamps completedAt when the last Spirit is found', () => {
    let s = foundReducer(empty(), c(1), 100);
    s = foundReducer(s, c(2), 200);
    s = foundReducer(s, c(3), 7000);
    expect(s.completedAt).toBe(7000);
    expect(timeTakenSeconds(s)).toBe(6);
    expect(formatTimeTaken(6)).toBe('0:06');
  });

  it('ignores another Hunt_ID', () => {
    const s = empty();
    expect(foundReducer(s, c(1, { huntId: 'XYZ789' }), 1)).toBe(s);
  });

  it('ignores another total', () => {
    const s = empty();
    expect(foundReducer(s, c(1, { total: 4 }), 1)).toBe(s);
  });

  it('ignores input after completion', () => {
    let s = empty();
    for (const i of [1, 2, 3]) s = foundReducer(s, c(i), i * 10);
    expect(foundReducer(s, c(1, { name: 'Other' }), 999)).toBe(s);
  });

  it('gives 0 seconds for a negative difference', () => {
    expect(
      timeTakenSeconds({ huntId: 'ABC234', total: 3, found: [], firstFoundAt: 5000, completedAt: 1000 }),
    ).toBe(0);
  });

  it('formats minutes without a cap', () => {
    expect(formatTimeTaken(0)).toBe('0:00');
    expect(formatTimeTaken(65)).toBe('1:05');
    expect(formatTimeTaken(6000)).toBe('100:00');
  });

  it('lists unknown rows without leaking unfound names', () => {
    const s = foundReducer(empty(), c(2), 1);
    expect(counterRows(s)).toEqual([
      { index: 1, name: null },
      { index: 2, name: 'Ghost 2' },
      { index: 3, name: null },
    ]);
    expect(counterHeading(s)).toBe('Spirits found: 1 of 3');
  });
});
