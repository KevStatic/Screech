import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_BODY_BYTES,
  error,
  json,
  methodGuard,
  readJsonBody,
  seanceNotFound,
  serverError,
  timingSafeEqual,
} from '../src/http.js';

function post(body: BodyInit | null, headers?: Record<string, string>): Request {
  return new Request('https://example.test/api/x', { method: 'POST', body, headers });
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const c = chunks[i++];
      if (c) controller.enqueue(c);
      else controller.close();
    },
  });
}

describe('methodGuard', () => {
  it('returns null for an allowed method, case-insensitively', () => {
    expect(methodGuard(['GET', 'POST'], 'GET')).toBeNull();
    expect(methodGuard(['GET', 'POST'], 'post')).toBeNull();
  });

  it('returns 405 with Allow equal to the allowed list and no-store', async () => {
    const res = methodGuard(['GET', 'POST'], 'DELETE');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(405);
    expect(res!.headers.get('Allow')).toBe('GET, POST');
    expect(res!.headers.get('Cache-Control')).toBe('no-store');
    expect(res!.headers.get('Content-Type')).toBe('application/json');
    expect(res!.headers.get('Set-Cookie')).toBeNull();
    expect(await res!.json()).toHaveProperty('error');
  });

  it('lists a single allowed method in Allow', () => {
    expect(methodGuard(['POST'], 'GET')!.headers.get('Allow')).toBe('POST');
  });
});

describe('readJsonBody', () => {
  it('parses a valid JSON body', async () => {
    const r = await readJsonBody(post('{"a":1}'));
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });

  it('answers 413 when Content-Length exceeds the limit', async () => {
    const r = await readJsonBody(post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(413);
      expect(r.response.headers.get('Cache-Control')).toBe('no-store');
      expect(r.response.headers.get('Set-Cookie')).toBeNull();
    }
  });

  it('answers 413 when a streamed body exceeds the limit without Content-Length', async () => {
    const big = new Uint8Array(MAX_BODY_BYTES + 1).fill(0x20);
    const req = new Request('https://example.test/api/x', {
      method: 'POST',
      body: streamOf([big.slice(0, 1000), big.slice(1000)]),
      // @ts-expect-error duplex is required by Node for stream bodies
      duplex: 'half',
    });
    expect(req.headers.get('content-length')).toBeNull();
    const r = await readJsonBody(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it('accepts a body of exactly the limit', async () => {
    const pad = ' '.repeat(MAX_BODY_BYTES - 2);
    const r = await readJsonBody(post(`{}${pad}`));
    expect(r.ok).toBe(true);
  });

  it('answers 400 on invalid JSON', async () => {
    const r = await readJsonBody(post('{not json'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(r.response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('answers 400 on an empty body and on invalid UTF-8', async () => {
    const empty = await readJsonBody(post(null));
    expect(!empty.ok && empty.response.status).toBe(400);
    const bad = await readJsonBody(post(new Uint8Array([0xff, 0xfe, 0xfd])));
    expect(!bad.ok && bad.response.status).toBe(400);
  });
});

describe('timingSafeEqual', () => {
  it('is true for equal strings, including empty and multibyte', () => {
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('séance', 'séance')).toBe(true);
  });

  it('is false for different content or length', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('abcd', 'abc')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('agrees with === for any pair of strings', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(timingSafeEqual(a, b)).toBe(a === b);
        expect(timingSafeEqual(a, a)).toBe(true);
      }),
    );
  });
});

describe('no Set-Cookie on any response', () => {
  it('strips a caller-supplied Set-Cookie and sets no cookie from any helper', async () => {
    const responses: Response[] = [
      json(200, { ok: true }),
      json(200, { ok: true }, { 'Set-Cookie': 'a=b', 'set-cookie': 'c=d' }),
      error(400, 'x'),
      seanceNotFound(),
      serverError(),
      methodGuard(['GET'], 'PUT')!,
    ];
    const big = await readJsonBody(post('{}', { 'content-length': '999999' }));
    const bad = await readJsonBody(post('nope'));
    if (!big.ok) responses.push(big.response);
    if (!bad.ok) responses.push(bad.response);
    expect(responses).toHaveLength(8);
    for (const r of responses) {
      expect(r.headers.get('Set-Cookie')).toBeNull();
      expect(r.headers.getSetCookie()).toEqual([]);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});
