import { describe, it, expect } from 'vitest';
import { parseDateHeader, clockOffsetMs, correctedNowSeconds } from '../../src/logic/host-clock';
import { isDeviceId, randomDeviceId } from '../../src/logic/device-id';
import {
  HOST_KEY,
  DEVICE_ID_KEY,
  LAST_NAME_KEY,
  createHostRecordStore,
  getOrCreateDeviceId,
  loadLastName,
  parseHostRecord,
  saveLastName,
  type StorageLike,
} from '../../src/logic/seance-storage';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('denied');
  },
};

const record = { sessionId: 'ABCDEFGH', title: 'Lab', hostSecret: 's'.repeat(43) };
const fixedBytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i * 17);

// Requirements 12.3, 14.5, 19.5, 19.6
describe('host-clock', () => {
  it('parses a valid HTTP Date header', () => {
    expect(parseDateHeader('Thu, 01 Jan 1970 00:00:10 GMT')).toBe(10_000);
  });

  it.each([null, '', '   ', 'not a date', 'Tue, 99 Foo 2020 99:99:99 GMT'])('rejects bad header %j', (v) => {
    expect(parseDateHeader(v)).toBeNull();
  });

  it('computes offset as server minus local', () => {
    expect(clockOffsetMs(10_000, 4_000)).toBe(6_000);
    expect(clockOffsetMs(4_000, 10_000)).toBe(-6_000);
  });

  it('corrects local time to whole server seconds, rounding down', () => {
    expect(correctedNowSeconds(6_000, 4_000)).toBe(10);
    expect(correctedNowSeconds(6_999, 4_000)).toBe(10);
    expect(correctedNowSeconds(-1_500, 5_000)).toBe(3);
    expect(correctedNowSeconds(0, 4_000)).toBe(4);
  });

  it('round trips: offset then correction gives the server second', () => {
    const server = 1_700_000_123_456;
    const local = 1_700_000_000_000;
    expect(correctedNowSeconds(clockOffsetMs(server, local), local)).toBe(Math.floor(server / 1000));
  });
});

describe('device-id', () => {
  it('makes 32 lowercase hex characters', () => {
    const id = randomDeviceId(fixedBytes);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(isDeviceId(id)).toBe(true);
  });

  it('zero-pads small bytes and asks for 16 bytes', () => {
    let asked = 0;
    const id = randomDeviceId((n) => {
      asked = n;
      return new Uint8Array(n);
    });
    expect(asked).toBe(16);
    expect(id).toBe('0'.repeat(32));
  });

  it.each([
    ['too short', 'a'.repeat(31)],
    ['too long', 'a'.repeat(33)],
    ['uppercase', 'A'.repeat(32)],
    ['non-hex', 'g'.repeat(32)],
    ['empty', ''],
    ['with newline', `${'a'.repeat(32)}\n`],
    ['null', null],
    ['number', 12],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isDeviceId(value)).toBe(false);
  });
});

describe('seance-storage', () => {
  it('parseHostRecord accepts a complete record and rejects bad input', () => {
    expect(parseHostRecord(JSON.stringify(record))).toEqual(record);
    expect(parseHostRecord('{not json')).toBeNull();
    expect(parseHostRecord('null')).toBeNull();
    expect(parseHostRecord('[]')).toBeNull();
    expect(parseHostRecord(JSON.stringify({ ...record, hostSecret: '' }))).toBeNull();
    expect(parseHostRecord(JSON.stringify({ sessionId: 'A', title: 'x' }))).toBeNull();
    expect(parseHostRecord(JSON.stringify({ ...record, title: 5 }))).toBeNull();
    expect(parseHostRecord(42)).toBeNull();
  });

  it('host store saves, loads and clears via session storage', () => {
    const session = fakeStorage();
    const store = createHostRecordStore(session);
    expect(store.save(record)).toEqual({ persisted: true });
    expect(session.data.has(HOST_KEY)).toBe(true);
    expect(store.load()).toEqual(record);
    expect(store.clear()).toEqual({ cleared: true });
    expect(session.data.has(HOST_KEY)).toBe(false);
    expect(store.load()).toBeNull();
  });

  it('host store ignores invalid JSON in storage', () => {
    const store = createHostRecordStore(fakeStorage({ [HOST_KEY]: '{oops' }));
    expect(store.load()).toBeNull();
  });

  it('host store keeps the record in memory when storage throws', () => {
    const store = createHostRecordStore(throwing);
    expect(store.save(record)).toEqual({ persisted: false });
    expect(store.load()).toEqual(record);
    expect(store.clear()).toEqual({ cleared: false });
    expect(store.load()).toBeNull();
  });

  it('host store works in memory with no storage', () => {
    const store = createHostRecordStore(null);
    expect(store.save(record)).toEqual({ persisted: false });
    expect(store.load()).toEqual(record);
    expect(store.clear()).toEqual({ cleared: true });
  });

  it('host store saves only the three allowed fields', () => {
    const session = fakeStorage();
    const extra = { ...record, extra: 'x' } as typeof record;
    createHostRecordStore(session).save(extra);
    expect(Object.keys(JSON.parse(session.data.get(HOST_KEY) ?? '{}')).sort()).toEqual([
      'hostSecret',
      'sessionId',
      'title',
    ]);
  });

  it('the Host_Secret never reaches local storage', () => {
    const session = fakeStorage();
    const local = fakeStorage();
    const store = createHostRecordStore(session);
    store.save(record);
    getOrCreateDeviceId(local, fixedBytes);
    saveLastName(local, 'Ada');
    loadLastName(local);
    store.load();
    store.clear();
    for (const value of local.data.values()) expect(value).not.toContain(record.hostSecret);
    expect([...local.data.keys()].sort()).toEqual([DEVICE_ID_KEY, LAST_NAME_KEY]);
    expect(local.data.has(HOST_KEY)).toBe(false);
  });

  it('getOrCreateDeviceId reuses a valid saved id and replaces a malformed one', () => {
    const good = 'ab'.repeat(16);
    expect(getOrCreateDeviceId(fakeStorage({ [DEVICE_ID_KEY]: good }), fixedBytes)).toBe(good);
    const local = fakeStorage({ [DEVICE_ID_KEY]: 'BAD' });
    const made = getOrCreateDeviceId(local, fixedBytes);
    expect(isDeviceId(made)).toBe(true);
    expect(local.data.get(DEVICE_ID_KEY)).toBe(made);
  });

  it('getOrCreateDeviceId still returns an id when storage is null or throws', () => {
    expect(isDeviceId(getOrCreateDeviceId(null, fixedBytes))).toBe(true);
    expect(isDeviceId(getOrCreateDeviceId(throwing, fixedBytes))).toBe(true);
  });

  it('last name helpers handle empty, null and throwing storage', () => {
    const local = fakeStorage();
    expect(loadLastName(local)).toBeNull();
    expect(saveLastName(local, 'Ada')).toEqual({ persisted: true });
    expect(loadLastName(local)).toBe('Ada');
    local.data.set(LAST_NAME_KEY, '');
    expect(loadLastName(local)).toBeNull();
    expect(loadLastName(null)).toBeNull();
    expect(saveLastName(null, 'x')).toEqual({ persisted: false });
    expect(loadLastName(throwing)).toBeNull();
    expect(saveLastName(throwing, 'x')).toEqual({ persisted: false });
  });
});
