import { describe, it, expect } from 'vitest';
import type { FoundState } from '../../src/logic/hunt-found';
import {
  PROGRESS_KEY_PREFIX,
  createProgressStore,
  parseFoundState,
  serializeFoundState,
  type StorageLike,
} from '../../src/logic/hunt-progress';

const A: FoundState = {
  huntId: 'ABC234',
  total: 3,
  found: [
    { index: 1, name: 'Moth' },
    { index: 3, name: 'Crow' },
  ],
  firstFoundAt: 1000,
  completedAt: null,
};
const B: FoundState = { huntId: 'XYZ789', total: 4, found: [], firstFoundAt: null, completedAt: null };

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing = (): never => {
  throw new Error('storage blocked');
};

describe('hunt-progress', () => {
  it('null storage keeps progress in memory and reports not persisted', () => {
    const store = createProgressStore(null);
    expect(store.load(A.huntId)).toBeNull();
    expect(store.save(A)).toEqual({ persisted: false });
    expect(store.load(A.huntId)).toEqual(A);
    expect(store.clear(A.huntId)).toEqual({ cleared: true });
    expect(store.load(A.huntId)).toBeNull();
  });

  it('storage that throws on read falls back to memory', () => {
    const store = createProgressStore({ getItem: throwing, setItem: () => undefined, removeItem: () => undefined });
    expect(store.load(A.huntId)).toBeNull();
    expect(store.save(A)).toEqual({ persisted: true });
    expect(store.load(A.huntId)).toEqual(A);
  });

  it('storage that throws on write reports not persisted but keeps memory', () => {
    const store = createProgressStore({ getItem: () => null, setItem: throwing, removeItem: () => undefined });
    expect(store.save(A)).toEqual({ persisted: false });
    expect(store.load(A.huntId)).toEqual(A);
  });

  it('invalid stored text loads as null and is left in place', () => {
    const storage = memoryStorage();
    const key = `${PROGRESS_KEY_PREFIX}${A.huntId}`;
    for (const text of ['', 'not json', '[]', 'null', '{"v":2}', serializeFoundState(B)]) {
      storage.data.set(key, text);
      expect(createProgressStore(storage).load(A.huntId)).toBeNull();
      expect(storage.data.get(key)).toBe(text);
    }
  });

  it('rejects structurally invalid states', () => {
    const ok = JSON.parse(serializeFoundState(A)) as Record<string, unknown>;
    const bad = [
      { ...ok, found: [[3, 'Crow'], [1, 'Moth']] },
      { ...ok, found: [[1, 'Moth'], [1, 'Moth']] },
      { ...ok, found: [[4, 'Moth']] },
      { ...ok, found: [[1, '']] },
      { ...ok, first: null },
      { ...ok, done: 5 },
      { ...ok, total: 2 },
    ];
    for (const b of bad) expect(parseFoundState(JSON.stringify(b), A.huntId)).toBeNull();
  });

  it('keeps two Hunt_IDs under separate keys', () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    store.save(A);
    store.save(B);
    expect([...storage.data.keys()].sort()).toEqual([
      `${PROGRESS_KEY_PREFIX}${A.huntId}`,
      `${PROGRESS_KEY_PREFIX}${B.huntId}`,
    ]);
    store.clear(A.huntId);
    expect(storage.data.has(`${PROGRESS_KEY_PREFIX}${A.huntId}`)).toBe(false);
    expect(createProgressStore(storage).load(B.huntId)).toEqual(B);
  });

  it('clear that throws reports not cleared and does not throw', () => {
    const store = createProgressStore({ getItem: () => null, setItem: () => undefined, removeItem: throwing });
    store.save(A);
    expect(store.clear(A.huntId)).toEqual({ cleared: false });
  });

  it('stored text contains no clue text', () => {
    expect(serializeFoundState(A)).not.toMatch(/clue|hideAt|opening/i);
  });
});
