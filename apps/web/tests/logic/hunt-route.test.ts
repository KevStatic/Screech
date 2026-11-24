import { describe, it, expect } from 'vitest';
import { buildClueText } from '@screech/core';
import type { ClueFields, DecodedPacket, Result } from '@screech/core';
import type { FoundState } from '../../src/logic/hunt-found';
import { PROGRESS_KEY_PREFIX, createProgressStore, serializeFoundState } from '../../src/logic/hunt-progress';
import type { StorageLike } from '../../src/logic/hunt-progress';
import { huntIntake, huntRoute } from '../../src/logic/hunt-route';

const fields: ClueFields = { huntId: 'ABCDEF', index: 2, total: 3, name: 'Wren', clue: 'Under the stairs' };
const flags = { sealed: false, compressed: false, multipart: false };

function packet(text: string): Result<DecodedPacket> {
  return { ok: true, value: { multipart: false, type: 'hunt-clue', flags, payload: { type: 'hunt-clue', text } } };
}

function spy(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes = { count: 0 };
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      writes.count += 1;
      data.set(k, v);
    },
    removeItem: (k) => {
      writes.count += 1;
      data.delete(k);
    },
  };
  return { data, writes, storage };
}

const key = `${PROGRESS_KEY_PREFIX}${fields.huntId}`;

describe('huntRoute', () => {
  it('routes a valid clue', () => {
    expect(huntRoute(packet(buildClueText(fields)))).toEqual({ kind: 'clue', fields });
  });

  it('routes unparsable text to garbled', () => {
    expect(huntRoute(packet('nonsense'))).toEqual({ kind: 'garbled' });
  });

  it('ignores multipart hunt-clue, errors and non-results', () => {
    const multi: Result<DecodedPacket> = {
      ok: true,
      value: { multipart: true, type: 'hunt-clue', flags: { ...flags, multipart: true }, body: new Uint8Array(2) },
    };
    expect(huntRoute(multi)).toEqual({ kind: 'none' });
    expect(huntRoute({ ok: false, error: { code: 'bad-magic', message: 'x' } } as Result<DecodedPacket>)).toEqual({
      kind: 'none',
    });
    expect(huntRoute(null as unknown as Result<DecodedPacket>)).toEqual({ kind: 'none' });
  });
});

describe('huntIntake', () => {
  const found: FoundState = {
    huntId: 'ABCDEF',
    total: 3,
    found: [{ index: 2, name: 'First Name' }],
    firstFoundAt: 10,
    completedAt: null,
  };

  it('first find saves once and returns new', () => {
    const { data, writes, storage } = spy();
    const out = huntIntake(createProgressStore(storage), fields, 100);
    expect(out.kind).toBe('new');
    expect(writes.count).toBe(1);
    expect(data.has(key)).toBe(true);
  });

  it('an already intake changes no state and makes 0 storage writes', () => {
    const text = serializeFoundState(found);
    const { data, writes, storage } = spy({ [key]: text });
    const out = huntIntake(createProgressStore(storage), fields, 100);
    expect(out).toEqual({ kind: 'already', fields, storedName: 'First Name' });
    expect(writes.count).toBe(0);
    expect(data.get(key)).toBe(text);
  });

  it('a complete hunt writes nothing', () => {
    const done: FoundState = {
      huntId: 'ABCDEF',
      total: 3,
      found: [1, 2, 3].map((index) => ({ index, name: `n${index}` })),
      firstFoundAt: 1,
      completedAt: 9,
    };
    const { writes, storage } = spy({ [key]: serializeFoundState(done) });
    const out = huntIntake(createProgressStore(storage), fields, 100);
    expect(out.kind).toBe('complete');
    expect(writes.count).toBe(0);
  });

  it('treats a stored invalid state as empty (first find)', () => {
    const { data, writes, storage } = spy({ [key]: '{not json' });
    const out = huntIntake(createProgressStore(storage), fields, 100);
    expect(out.kind).toBe('new');
    if (out.kind === 'new') {
      expect(out.before.found).toEqual([]);
      expect(out.state.found).toEqual([{ index: 2, name: 'Wren' }]);
    }
    expect(writes.count).toBe(1);
    expect(data.get(key)).not.toBe('{not json');
  });
});
