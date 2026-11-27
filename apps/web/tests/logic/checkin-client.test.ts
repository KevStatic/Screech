import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MSG_CODE_EXPIRED,
  MSG_CREATE_NO_SIGNAL,
  MSG_CREATE_SERVER,
  MSG_END_FAILED,
  MSG_END_NO_SIGNAL,
  MSG_ENDED,
  MSG_JOIN_FAILED,
  MSG_JOIN_NO_SIGNAL,
  MSG_JOIN_SERVER,
  MSG_NAME_LENGTH,
  MSG_NOT_FOUND,
  POLL_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  createErrorMessage,
  createSeance,
  endErrorMessage,
  fetchPublic,
  joinErrorMessage,
  parseCheckinResponse,
  parseCreateResponse,
  parseEndResponse,
  parseHostResponse,
  parsePublicResponse,
  pollHost,
  postCheckin,
  postEnd,
  type ApiOutcome,
  type FetchLike,
} from '../../src/logic/checkin-client';

afterEach(() => {
  vi.useRealTimers();
});

const httpError = (status: number): ApiOutcome<unknown> => ({ kind: 'http-error', status, body: undefined });

describe('parseCreateResponse', () => {
  const good = { sessionId: 'abc', title: 'Math 101', hostSecret: 'sek' };
  it('accepts a good 201 body', () => {
    expect(parseCreateResponse(201, good)).toEqual({ kind: 'ok', value: good });
  });
  it('strips unknown fields', () => {
    const out = parseCreateResponse(200, { ...good, extra: 1 });
    expect(out).toEqual({ kind: 'ok', value: good });
  });
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array', [good]],
    ['string', 'x'],
    ['missing hostSecret', { sessionId: 'a', title: 't' }],
    ['numeric sessionId', { ...good, sessionId: 5 }],
    ['empty sessionId', { ...good, sessionId: '' }],
    ['empty hostSecret', { ...good, hostSecret: '' }],
    ['non-string title', { ...good, title: null }],
  ])('treats a 2xx with %s as http-error', (_n, body) => {
    expect(parseCreateResponse(201, body)).toEqual({ kind: 'http-error', status: 201, body });
  });
  it('keeps status and body for non-2xx', () => {
    expect(parseCreateResponse(500, good)).toEqual({ kind: 'http-error', status: 500, body: good });
  });
});

describe('parsePublicResponse', () => {
  it('accepts open and closed', () => {
    expect(parsePublicResponse(200, { title: 'T', open: true })).toEqual({ kind: 'ok', value: { title: 'T', open: true } });
    expect(parsePublicResponse(200, { title: 'T', open: false })).toEqual({ kind: 'ok', value: { title: 'T', open: false } });
  });
  it.each([
    ['missing open', { title: 'T' }],
    ['open as string', { title: 'T', open: 'true' }],
    ['title number', { title: 1, open: true }],
    ['null', null],
    ['array', []],
  ])('rejects %s', (_n, body) => {
    expect(parsePublicResponse(200, body).kind).toBe('http-error');
  });
  it('maps 404 and 410 to http-error with the status', () => {
    expect(parsePublicResponse(404, { error: 'x' })).toMatchObject({ kind: 'http-error', status: 404 });
    expect(parsePublicResponse(410, undefined)).toMatchObject({ kind: 'http-error', status: 410 });
  });
});

describe('parseHostResponse', () => {
  it('accepts an empty and a filled list', () => {
    expect(parseHostResponse(200, { title: 'T', open: true, checkIns: [] })).toEqual({
      kind: 'ok',
      value: { title: 'T', open: true, checkIns: [] },
    });
    const checkIns = [
      { name: 'Ann', at: '2026-01-01T10:00:00.000Z' },
      { name: 'Bo', at: '2026-01-01T10:01:00.000Z' },
    ];
    expect(parseHostResponse(200, { title: 'T', open: false, checkIns })).toEqual({
      kind: 'ok',
      value: { title: 'T', open: false, checkIns },
    });
  });
  it.each([
    ['checkIns missing', { title: 'T', open: true }],
    ['checkIns not an array', { title: 'T', open: true, checkIns: {} }],
    ['entry is a string', { title: 'T', open: true, checkIns: ['Ann'] }],
    ['entry missing at', { title: 'T', open: true, checkIns: [{ name: 'Ann' }] }],
    ['entry name number', { title: 'T', open: true, checkIns: [{ name: 1, at: 'x' }] }],
    ['entry null', { title: 'T', open: true, checkIns: [null] }],
    ['open missing', { title: 'T', checkIns: [] }],
  ])('rejects %s', (_n, body) => {
    expect(parseHostResponse(200, body).kind).toBe('http-error');
  });
  it('maps 401 to http-error', () => {
    expect(parseHostResponse(401, null)).toEqual({ kind: 'http-error', status: 401, body: null });
  });
});

describe('parseCheckinResponse', () => {
  it('accepts first and repeat check-ins', () => {
    const first = { name: 'Ann', at: '2026-01-01T10:00:00.000Z', alreadyCheckedIn: false };
    expect(parseCheckinResponse(200, first)).toEqual({ kind: 'ok', value: first });
    expect(parseCheckinResponse(200, { ...first, alreadyCheckedIn: true })).toEqual({
      kind: 'ok',
      value: { ...first, alreadyCheckedIn: true },
    });
  });
  it.each([
    ['missing alreadyCheckedIn', { name: 'A', at: 'x' }],
    ['alreadyCheckedIn as number', { name: 'A', at: 'x', alreadyCheckedIn: 1 }],
    ['at missing', { name: 'A', alreadyCheckedIn: false }],
    ['name null', { name: null, at: 'x', alreadyCheckedIn: false }],
    ['non-object', 42],
  ])('rejects %s', (_n, body) => {
    expect(parseCheckinResponse(200, body).kind).toBe('http-error');
  });
  it.each([400, 403, 404, 410, 503])('keeps status %i as http-error', (status) => {
    expect(parseCheckinResponse(status, { error: 'x' })).toMatchObject({ kind: 'http-error', status });
  });
});

describe('parseEndResponse', () => {
  it('accepts zero and positive counts', () => {
    expect(parseEndResponse(200, { count: 0 })).toEqual({ kind: 'ok', value: { count: 0 } });
    expect(parseEndResponse(200, { count: 12 })).toEqual({ kind: 'ok', value: { count: 12 } });
  });
  it.each([
    ['negative', { count: -1 }],
    ['fractional', { count: 1.5 }],
    ['NaN', { count: Number.NaN }],
    ['string', { count: '3' }],
    ['missing', {}],
    ['null', null],
  ])('rejects %s count', (_n, body) => {
    expect(parseEndResponse(200, body).kind).toBe('http-error');
  });
  it('maps 403 to http-error', () => {
    expect(parseEndResponse(403, undefined)).toMatchObject({ kind: 'http-error', status: 403 });
  });
});

describe('status boundaries', () => {
  const body = { count: 1 };
  it('treats 200 and 299 as success and 199, 300 as failure', () => {
    expect(parseEndResponse(200, body).kind).toBe('ok');
    expect(parseEndResponse(299, body).kind).toBe('ok');
    expect(parseEndResponse(199, body).kind).toBe('http-error');
    expect(parseEndResponse(300, body).kind).toBe('http-error');
  });
  it('treats a non-integer status as failure', () => {
    expect(parseEndResponse(200.5, body).kind).toBe('http-error');
  });
});

describe('joinErrorMessage (Requirement 16)', () => {
  it('16.1: 403 expired code', () => {
    expect(joinErrorMessage(httpError(403))).toBe('The code expired. Move closer and listen again.');
    expect(MSG_CODE_EXPIRED).toBe('The code expired. Move closer and listen again.');
  });
  it('16.3: 410 ended', () => {
    expect(joinErrorMessage(httpError(410))).toBe('The séance has ended. Nobody can join now.');
    expect(MSG_ENDED).toBe('The séance has ended. Nobody can join now.');
  });
  it('16.4: 404 not found', () => {
    expect(joinErrorMessage(httpError(404))).toBe('This séance was not found. It may be over.');
    expect(MSG_NOT_FOUND).toBe('This séance was not found. It may be over.');
  });
  it('16.5: 400 name length', () => {
    expect(joinErrorMessage(httpError(400))).toBe('The name must be 1 to 32 characters.');
    expect(MSG_NAME_LENGTH).toBe('The name must be 1 to 32 characters.');
  });
  it('16.6: network error and timeout', () => {
    const msg = 'No signal from the server. Check the network and tap Join again.';
    expect(joinErrorMessage({ kind: 'network-error' })).toBe(msg);
    expect(joinErrorMessage({ kind: 'timeout' })).toBe(msg);
    expect(MSG_JOIN_NO_SIGNAL).toBe(msg);
  });
  it('16.7: 500 to 599', () => {
    for (const s of [500, 502, 503, 599]) {
      expect(joinErrorMessage(httpError(s))).toBe('The server could not count you. Tap Join to try again.');
    }
    expect(MSG_JOIN_SERVER).toBe('The server could not count you. Tap Join to try again.');
  });
  it('16.8: any other non-2xx status says the check-in failed and offers Join', () => {
    for (const s of [401, 405, 409, 418, 429, 301, 600, 100]) {
      const m = joinErrorMessage(httpError(s));
      expect(m).toBe(MSG_JOIN_FAILED);
      expect(m).toMatch(/check-in failed/i);
      expect(m).toMatch(/tap Join to try again/i);
    }
  });
  it('falls back to the generic message for an ok outcome', () => {
    expect(joinErrorMessage({ kind: 'ok', value: 1 })).toBe(MSG_JOIN_FAILED);
  });
  it('never shows a status code', () => {
    for (const s of [400, 403, 404, 410, 500, 418]) {
      expect(joinErrorMessage(httpError(s))).not.toMatch(/\d{3}/);
    }
  });
});

describe('createErrorMessage and endErrorMessage', () => {
  it('create: no signal for network-error and timeout, server message otherwise', () => {
    expect(createErrorMessage({ kind: 'network-error' })).toBe(MSG_CREATE_NO_SIGNAL);
    expect(createErrorMessage({ kind: 'timeout' })).toBe(MSG_CREATE_NO_SIGNAL);
    expect(createErrorMessage(httpError(500))).toBe(MSG_CREATE_SERVER);
    expect(createErrorMessage(httpError(400))).toBe(MSG_CREATE_SERVER);
  });
  it('end: no signal for network-error and timeout, failure message otherwise', () => {
    expect(endErrorMessage({ kind: 'network-error' })).toBe(MSG_END_NO_SIGNAL);
    expect(endErrorMessage({ kind: 'timeout' })).toBe(MSG_END_NO_SIGNAL);
    expect(endErrorMessage(httpError(403))).toBe(MSG_END_FAILED);
  });
});

// ---------------------------------------------------------------------------
// Fetch wrapper with an injected fake fetch
// ---------------------------------------------------------------------------

interface Call {
  readonly input: string;
  readonly init: RequestInit;
}

function fakeResponse(status: number, body: unknown, date: string | null = null): Response {
  return {
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('no body');
      return body;
    },
    headers: { get: (n: string) => (n === 'Date' ? date : null) },
  } as unknown as Response;
}

function recorder(res: () => Promise<Response>): { fetchFn: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = (input, init) => {
    calls.push({ input, init: init ?? {} });
    return res();
  };
  return { fetchFn, calls };
}

/** A fetch that never answers and rejects when its signal aborts. */
function hangingFetch(): FetchLike {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
}

describe('fetch wrapper', () => {
  it('createSeance posts JSON to the relative /api/seance URL and returns the Date header', async () => {
    const value = { sessionId: 's1', title: 'T', hostSecret: 'h' };
    const { fetchFn, calls } = recorder(async () => fakeResponse(201, value, 'Wed, 01 Jan 2026 10:00:00 GMT'));
    const r = await createSeance(fetchFn, 'T');
    expect(r.outcome).toEqual({ kind: 'ok', value });
    expect(r.dateHeader).toBe('Wed, 01 Jan 2026 10:00:00 GMT');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe('/api/seance');
    expect(calls[0]!.input.startsWith('/api/')).toBe(true);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.body).toBe(JSON.stringify({ title: 'T' }));
    expect(new Headers(calls[0]!.init.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(calls[0]!.init.headers).has('Authorization')).toBe(false);
  });

  it('sends no Authorization header on public and check-in calls', async () => {
    const { fetchFn, calls } = recorder(async () => fakeResponse(200, { title: 'T', open: true }));
    await fetchPublic(fetchFn, 'abc');
    await postCheckin(fetchFn, 'abc', { code: 'c', name: 'n', deviceId: 'd' });
    for (const c of calls) expect(new Headers(c.init.headers).has('Authorization')).toBe(false);
    expect(calls[0]!.input).toBe('/api/seance/abc/public');
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[1]!.input).toBe('/api/seance/abc/checkin');
    expect(calls[1]!.init.method).toBe('POST');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ code: 'c', name: 'n', deviceId: 'd' });
  });

  it('pollHost sends Bearer Authorization to /api/seance/:id', async () => {
    const { fetchFn, calls } = recorder(async () => fakeResponse(200, { title: 'T', open: true, checkIns: [] }));
    const r = await pollHost(fetchFn, 'abc', 'secret-1');
    expect(r.outcome.kind).toBe('ok');
    expect(calls[0]!.input).toBe('/api/seance/abc');
    expect(calls[0]!.init.method).toBe('GET');
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('Bearer secret-1');
  });

  it('postEnd sends Bearer Authorization and no body', async () => {
    const { fetchFn, calls } = recorder(async () => fakeResponse(200, { count: 3 }));
    const r = await postEnd(fetchFn, 'abc', 'secret-2');
    expect(r.outcome).toEqual({ kind: 'ok', value: { count: 3 } });
    expect(calls[0]!.input).toBe('/api/seance/abc/end');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.body).toBeUndefined();
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('Bearer secret-2');
  });

  it('percent-encodes the session id so the path cannot escape /api/seance/', async () => {
    const { fetchFn, calls } = recorder(async () => fakeResponse(200, { title: 'T', open: true }));
    await fetchPublic(fetchFn, 'a/b?c');
    expect(calls[0]!.input).toBe('/api/seance/a%2Fb%3Fc/public');
  });

  it('passes an AbortSignal and disables caching', async () => {
    const { fetchFn, calls } = recorder(async () => fakeResponse(200, { title: 'T', open: true }));
    await fetchPublic(fetchFn, 'abc');
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.init.cache).toBe('no-store');
  });

  it('returns http-error with the status and body, and a null date when absent', async () => {
    const { fetchFn } = recorder(async () => fakeResponse(403, { error: 'expired' }));
    const r = await postCheckin(fetchFn, 'abc', { code: 'c', name: 'n', deviceId: 'd' });
    expect(r.outcome).toEqual({ kind: 'http-error', status: 403, body: { error: 'expired' } });
    expect(r.dateHeader).toBeNull();
  });

  it('treats a non-JSON error body as an http-error with the real status', async () => {
    const { fetchFn } = recorder(async () => fakeResponse(502, undefined));
    const r = await postCheckin(fetchFn, 'abc', { code: 'c', name: 'n', deviceId: 'd' });
    expect(r.outcome).toEqual({ kind: 'http-error', status: 502, body: undefined });
  });

  it('treats a 200 with a malformed body as http-error', async () => {
    const { fetchFn } = recorder(async () => fakeResponse(200, { nope: true }));
    const r = await postEnd(fetchFn, 'abc', 's');
    expect(r.outcome.kind).toBe('http-error');
  });

  it('reports a rejected fetch as network-error', async () => {
    const { fetchFn } = recorder(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await fetchPublic(fetchFn, 'abc');
    expect(r.outcome).toEqual({ kind: 'network-error' });
    expect(r.dateHeader).toBeNull();
  });

  it('reports a timeout after 10 s for normal requests', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const inner = hangingFetch();
    const fetchFn: FetchLike = (i, init) => {
      init?.signal?.addEventListener('abort', () => (aborted = true));
      return inner(i, init);
    };
    const p = postCheckin(fetchFn, 'abc', { code: 'c', name: 'n', deviceId: 'd' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(aborted).toBe(true);
    const r = await p;
    expect(r.outcome).toEqual({ kind: 'timeout' });
    expect(joinErrorMessage(r.outcome)).toBe(MSG_JOIN_NO_SIGNAL);
  });

  it('uses the shorter 5 s timeout for host polls', async () => {
    expect(POLL_TIMEOUT_MS).toBe(5_000);
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
    vi.useFakeTimers();
    const p = pollHost(hangingFetch(), 'abc', 's');
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS);
    expect((await p).outcome).toEqual({ kind: 'timeout' });
  });

  it('reports a timeout when the body read hangs past the deadline', async () => {
    vi.useFakeTimers();
    const fetchFn: FetchLike = (_i, init) =>
      Promise.resolve({
        status: 200,
        headers: { get: () => null },
        json: () =>
          new Promise((_res, rej) => {
            init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
          }),
      } as unknown as Response);
    const p = fetchPublic(fetchFn, 'abc');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect((await p).outcome).toEqual({ kind: 'timeout' });
  });

  it('clears the timer after a response so nothing fires later', async () => {
    vi.useFakeTimers();
    const { fetchFn } = recorder(async () => fakeResponse(200, { title: 'T', open: true }));
    await fetchPublic(fetchFn, 'abc');
    expect(vi.getTimerCount()).toBe(0);
  });
});
