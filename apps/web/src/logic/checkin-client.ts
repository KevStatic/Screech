/**
 * Request and response shaping for the Checkin_API.
 *
 * Parsers never throw. `fetch` is a dependency, so tests pass a fake.
 * Every URL is relative and starts with `/api/`, so the app and the functions
 * share one origin (requirement 18.3).
 */

export type ApiOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'http-error'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'timeout' };

export interface CreateValue {
  readonly sessionId: string;
  readonly title: string;
  readonly hostSecret: string;
}
export interface PublicValue {
  readonly title: string;
  readonly open: boolean;
}
export interface HostCheckIn {
  readonly name: string;
  readonly at: string;
}
export interface HostValue {
  readonly title: string;
  readonly open: boolean;
  readonly checkIns: readonly HostCheckIn[];
}
export interface CheckinValue {
  readonly name: string;
  readonly at: string;
  readonly alreadyCheckedIn: boolean;
}
export interface EndValue {
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Messages (requirements 10, 11, 12, 13, 16). Plain words, no status codes.
// ---------------------------------------------------------------------------

export const MSG_CODE_EXPIRED = 'The code expired. Move closer and listen again.';
export const MSG_ENDED = 'The séance has ended. Nobody can join now.';
export const MSG_NOT_FOUND = 'This séance was not found. It may be over.';
export const MSG_NAME_LENGTH = 'The name must be 1 to 32 characters.';
export const MSG_JOIN_NO_SIGNAL = 'No signal from the server. Check the network and tap Join again.';
export const MSG_JOIN_SERVER = 'The server could not count you. Tap Join to try again.';
export const MSG_JOIN_FAILED = 'The check-in failed. Tap Join to try again.';

/** 10.5, 10.8 */
export const MSG_CREATE_NO_SIGNAL = 'No signal from the server. Check the network and try again.';
/** 10.9 */
export const MSG_CREATE_SERVER = 'The server could not open a séance. Try again.';
/** 11.8 */
export const MSG_POLL_NO_SIGNAL = 'No signal from the server. Showing the last known list.';
/** 13.7 */
export const MSG_PUBLIC_NO_SIGNAL = 'No signal from the server. Check the network.';
/** 12.7 */
export const MSG_END_NO_SIGNAL = 'Could not close the séance. No signal from the server. Hold again to retry.';
/** 12.8 */
export const MSG_END_FAILED = 'The server rejected or failed the request to close the séance. Hold again to retry.';

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSuccess(status: number): boolean {
  return Number.isInteger(status) && status >= 200 && status <= 299;
}

function parseWith<T>(status: number, body: unknown, shape: (b: unknown) => T | null): ApiOutcome<T> {
  if (isSuccess(status)) {
    const value = shape(body);
    if (value !== null) return { kind: 'ok', value };
  }
  return { kind: 'http-error', status, body };
}

function shapeCreate(b: unknown): CreateValue | null {
  if (!isRecord(b)) return null;
  const { sessionId, title, hostSecret } = b;
  if (typeof sessionId !== 'string' || typeof title !== 'string' || typeof hostSecret !== 'string') return null;
  if (sessionId === '' || hostSecret === '') return null;
  return { sessionId, title, hostSecret };
}

function shapePublic(b: unknown): PublicValue | null {
  if (!isRecord(b)) return null;
  const { title, open } = b;
  if (typeof title !== 'string' || typeof open !== 'boolean') return null;
  return { title, open };
}

function shapeHost(b: unknown): HostValue | null {
  if (!isRecord(b)) return null;
  const { title, open, checkIns } = b;
  if (typeof title !== 'string' || typeof open !== 'boolean' || !Array.isArray(checkIns)) return null;
  const list: HostCheckIn[] = [];
  for (const item of checkIns as unknown[]) {
    if (!isRecord(item) || typeof item['name'] !== 'string' || typeof item['at'] !== 'string') return null;
    list.push({ name: item['name'], at: item['at'] });
  }
  return { title, open, checkIns: list };
}

function shapeCheckin(b: unknown): CheckinValue | null {
  if (!isRecord(b)) return null;
  const { name, at, alreadyCheckedIn } = b;
  if (typeof name !== 'string' || typeof at !== 'string' || typeof alreadyCheckedIn !== 'boolean') return null;
  return { name, at, alreadyCheckedIn };
}

function shapeEnd(b: unknown): EndValue | null {
  if (!isRecord(b)) return null;
  const { count } = b;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
  return { count };
}

export function parseCreateResponse(status: number, body: unknown): ApiOutcome<CreateValue> {
  return parseWith(status, body, shapeCreate);
}
export function parsePublicResponse(status: number, body: unknown): ApiOutcome<PublicValue> {
  return parseWith(status, body, shapePublic);
}
export function parseHostResponse(status: number, body: unknown): ApiOutcome<HostValue> {
  return parseWith(status, body, shapeHost);
}
export function parseCheckinResponse(status: number, body: unknown): ApiOutcome<CheckinValue> {
  return parseWith(status, body, shapeCheckin);
}
export function parseEndResponse(status: number, body: unknown): ApiOutcome<EndValue> {
  return parseWith(status, body, shapeEnd);
}

// ---------------------------------------------------------------------------
// Messages for outcomes
// ---------------------------------------------------------------------------

/**
 * Maps a check-in outcome to its plain-word message (16.1, 16.3 to 16.8).
 * Never includes a status code, exception name or server text (16.9).
 */
export function joinErrorMessage(outcome: ApiOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'network-error':
    case 'timeout':
      return MSG_JOIN_NO_SIGNAL;
    case 'ok':
      return MSG_JOIN_FAILED;
    case 'http-error': {
      const s = outcome.status;
      if (s === 403) return MSG_CODE_EXPIRED;
      if (s === 410) return MSG_ENDED;
      if (s === 404) return MSG_NOT_FOUND;
      if (s === 400) return MSG_NAME_LENGTH;
      if (s >= 500 && s <= 599) return MSG_JOIN_SERVER;
      return MSG_JOIN_FAILED;
    }
  }
}

/** Start_Form message for a failed create call (10.5, 10.8, 10.9). */
export function createErrorMessage(outcome: ApiOutcome<unknown>): string {
  if (outcome.kind === 'network-error' || outcome.kind === 'timeout') return MSG_CREATE_NO_SIGNAL;
  return MSG_CREATE_SERVER;
}

/** Message for a failed end call (12.7, 12.8). */
export function endErrorMessage(outcome: ApiOutcome<unknown>): string {
  if (outcome.kind === 'network-error' || outcome.kind === 'timeout') return MSG_END_NO_SIGNAL;
  return MSG_END_FAILED;
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 10_000;
export const POLL_TIMEOUT_MS = 5_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiResult<T> {
  readonly outcome: ApiOutcome<T>;
  /** The response `Date` header, or null when absent or no response. */
  readonly dateHeader: string | null;
}

interface RequestSpec {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  readonly hostSecret?: string;
  readonly timeoutMs: number;
}

function assertApiPath(path: string): void {
  if (!path.startsWith('/api/')) throw new Error('API paths must be relative and start with /api/.');
}

async function send<T>(
  fetchFn: FetchLike,
  spec: RequestSpec,
  parse: (status: number, body: unknown) => ApiOutcome<T>,
): Promise<ApiResult<T>> {
  assertApiPath(spec.path);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, spec.timeoutMs);

  const headers: Record<string, string> = {};
  if (spec.body !== undefined) headers['Content-Type'] = 'application/json';
  if (spec.hostSecret !== undefined) headers['Authorization'] = `Bearer ${spec.hostSecret}`;
  const init: RequestInit = { method: spec.method, headers, signal: controller.signal, cache: 'no-store' };
  if (spec.body !== undefined) init.body = JSON.stringify(spec.body);

  try {
    const res = await fetchFn(spec.path, init);
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      if (timedOut) throw e;
      body = undefined;
    }
    return { outcome: parse(res.status, body), dateHeader: res.headers.get('Date') };
  } catch {
    return { outcome: timedOut ? { kind: 'timeout' } : { kind: 'network-error' }, dateHeader: null };
  } finally {
    clearTimeout(timer);
  }
}

const base = (id: string): string => `/api/seance/${encodeURIComponent(id)}`;

/** `POST /api/seance`. `dateHeader` feeds the clock offset (12.3). */
export function createSeance(fetchFn: FetchLike, title: string): Promise<ApiResult<CreateValue>> {
  return send(fetchFn, { method: 'POST', path: '/api/seance', body: { title }, timeoutMs: REQUEST_TIMEOUT_MS }, parseCreateResponse);
}

/** `GET /api/seance/:id/public` */
export function fetchPublic(fetchFn: FetchLike, sessionId: string): Promise<ApiResult<PublicValue>> {
  return send(fetchFn, { method: 'GET', path: `${base(sessionId)}/public`, timeoutMs: REQUEST_TIMEOUT_MS }, parsePublicResponse);
}

/** `GET /api/seance/:id` with the Host_Secret. Poll timeout is 5 s (11.6). */
export function pollHost(fetchFn: FetchLike, sessionId: string, hostSecret: string): Promise<ApiResult<HostValue>> {
  return send(fetchFn, { method: 'GET', path: base(sessionId), hostSecret, timeoutMs: POLL_TIMEOUT_MS }, parseHostResponse);
}

/** `POST /api/seance/:id/checkin` */
export function postCheckin(
  fetchFn: FetchLike,
  sessionId: string,
  fields: { readonly code: string; readonly name: string; readonly deviceId: string },
): Promise<ApiResult<CheckinValue>> {
  return send(
    fetchFn,
    {
      method: 'POST',
      path: `${base(sessionId)}/checkin`,
      body: { code: fields.code, name: fields.name, deviceId: fields.deviceId },
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    parseCheckinResponse,
  );
}

/** `POST /api/seance/:id/end` with the Host_Secret. */
export function postEnd(fetchFn: FetchLike, sessionId: string, hostSecret: string): Promise<ApiResult<EndValue>> {
  return send(fetchFn, { method: 'POST', path: `${base(sessionId)}/end`, hostSecret, timeoutMs: REQUEST_TIMEOUT_MS }, parseEndResponse);
}
