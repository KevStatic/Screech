// Feature: seance, task 11.7: host screens (SeanceHost, useSeanceHost, CandleCircle)
// (Requirements 4.8, 4.9, 10.5, 10.7, 10.8, 10.9, 10.11, 11.3, 11.8, 12.7, 19.4)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import SeanceHost from '../../src/ui/screens/SeanceHost';
import CandleCircle from '../../src/ui/components/CandleCircle';
import { GONE_MESSAGE, TITLE_MESSAGE } from '../../src/ui/hooks/useSeanceHost';
import type { SeanceHostDeps } from '../../src/ui/hooks/useSeanceHost';
import {
  MSG_CREATE_NO_SIGNAL,
  MSG_CREATE_SERVER,
  MSG_END_FAILED,
  MSG_END_NO_SIGNAL,
  MSG_POLL_NO_SIGNAL,
} from '../../src/logic/checkin-client';
import { HOLD_DURATION_MS } from '../../src/logic/hold-machine';
import { HOST_KEY } from '../../src/logic/seance-storage';
import type { StorageLike } from '../../src/logic/seance-storage';

// The screen calls useSeanceHost() with no arguments, so the test injects its deps here.
const injected = vi.hoisted(() => ({ deps: {} as Record<string, unknown> }));
vi.mock('../../src/ui/hooks/useSeanceHost', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/hooks/useSeanceHost')>();
  return {
    ...actual,
    useSeanceHost: (own?: Partial<SeanceHostDeps>) =>
      actual.useSeanceHost({ ...(injected.deps as Partial<SeanceHostDeps>), ...own }),
  };
});

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const RECORD = { sessionId: 'ABCD2345', title: 'Night watch', hostSecret: SECRET };

interface Call {
  readonly method: string;
  readonly url: string;
  readonly auth: string | null;
}
type Reply = { status: number; body: unknown } | 'network' | 'hang';
type Router = (call: Call) => Reply;

function makeFetch(router: Router): { fetch: SeanceHostDeps['fetch']; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: SeanceHostDeps['fetch'] = (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = { method: init?.method ?? 'GET', url, auth: headers['Authorization'] ?? null };
    calls.push(call);
    const reply = router(call);
    if (reply === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (reply === 'hang') return new Promise<Response>(() => undefined);
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  };
  return { fetch: fetchFn, calls };
}

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

interface Rig {
  readonly storage: ReturnType<typeof fakeStorage>;
  readonly saveFile: ReturnType<typeof vi.fn>;
  readonly calls: Call[];
}

function setup(router: Router, stored: boolean): Rig {
  const storage = fakeStorage(stored ? { [HOST_KEY]: JSON.stringify(RECORD) } : {});
  const saveFile = vi.fn();
  const { fetch: fetchFn, calls } = makeFetch(router);
  injected.deps = {
    fetch: fetchFn,
    unlockAudio: () => Promise.resolve({ ok: false, reason: 'context-unavailable' }),
    ensureRunning: () => Promise.resolve(),
    currentContext: () => null,
    wake: {
      acquire: () => Promise.resolve('held'),
      release: () => Promise.resolve(),
      onChange: () => () => undefined,
    },
    session: storage,
    isVisible: () => true,
    onVisibilityChange: () => () => undefined,
    saveFile,
  };
  return { storage, saveFile, calls };
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mount(): Promise<void> {
  render(createElement(SeanceHost, { onLeave: () => undefined }));
  await flush();
}

const hostReply = (checkIns: Array<{ name: string; at: string }>, open = true): Reply => ({
  status: 200,
  body: { title: RECORD.title, open, checkIns },
});

const isPoll = (c: Call): boolean => c.method === 'GET';

async function typeTitleAndStart(title: string): Promise<void> {
  fireEvent.change(screen.getByTestId('seance-title-input'), { target: { value: title } });
  fireEvent.click(screen.getByTestId('seance-start'));
  await flush();
}

async function holdEnd(): Promise<void> {
  const key = screen.getByTestId('seance-end');
  fireEvent.keyDown(key, { key: ' ' });
  await flush(HOLD_DURATION_MS + 100);
  fireEvent.keyUp(key, { key: ' ' }); // the key may be gone by now; the event is harmless
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  injected.deps = {};
});

describe('SeanceHost: Start_Form', () => {
  it('shows the keep-this-tab-open text on the form (10.7)', async () => {
    setup(() => 'hang', false);
    await mount();
    expect(screen.getByTestId('seance-keep-open').textContent).toMatch(/Keep this tab open/);
  });

  it('rejects an empty Title without calling the server', async () => {
    const rig = setup(() => 'hang', false);
    await mount();
    await typeTitleAndStart('   ');
    expect(screen.getByTestId('seance-start-error').textContent).toBe(TITLE_MESSAGE);
    expect(rig.calls).toHaveLength(0);
  });

  it('says no signal when the network fails and keeps the typed Title (10.5, 10.8)', async () => {
    setup(() => 'network', false);
    await mount();
    await typeTitleAndStart('Night watch');
    expect(screen.getByTestId('seance-start-error').textContent).toBe(MSG_CREATE_NO_SIGNAL);
    expect((screen.getByTestId('seance-title-input') as HTMLInputElement).value).toBe('Night watch');
    expect((screen.getByTestId('seance-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says the server could not open a séance on a 500 and keeps the Title (10.9)', async () => {
    setup(() => ({ status: 500, body: { error: 'boom' } }), false);
    await mount();
    await typeTitleAndStart('Night watch');
    expect(screen.getByTestId('seance-start-error').textContent).toBe(MSG_CREATE_SERVER);
    expect(screen.getByTestId('seance-start-error').textContent).not.toMatch(/500|boom/);
    expect((screen.getByTestId('seance-title-input') as HTMLInputElement).value).toBe('Night watch');
  });

  it('opens the room after a created séance and saves the host record', async () => {
    const rig = setup(
      (c) => (c.method === 'POST' ? { status: 201, body: RECORD } : hostReply([])),
      false,
    );
    await mount();
    await typeTitleAndStart('Night watch');
    expect(screen.getByTestId('seance-title').textContent).toBe('Night watch');
    expect(JSON.parse(rig.storage.data.get(HOST_KEY) ?? 'null')).toEqual(RECORD);
  });
});

describe('SeanceHost: resume', () => {
  it('resumes from sessionStorage and polls with the saved secret (10.11)', async () => {
    const rig = setup(() => hostReply([]), true);
    await mount();
    expect(screen.getByTestId('seance-title').textContent).toBe(RECORD.title);
    const poll = rig.calls.find(isPoll);
    expect(poll?.url).toBe(`/api/seance/${RECORD.sessionId}`);
    expect(poll?.auth).toBe(`Bearer ${SECRET}`);
    expect(rig.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('on a 404 clears storage and returns to the Start_Form with a message (10.11)', async () => {
    const rig = setup(() => ({ status: 404, body: { error: 'not found' } }), true);
    await mount();
    expect(screen.getByTestId('seance-start-error').textContent).toBe(GONE_MESSAGE);
    expect(screen.getByTestId('seance-start')).toBeTruthy();
    expect(rig.storage.data.has(HOST_KEY)).toBe(false);
  });
});

describe('SeanceHost: room', () => {
  it('lights one candle per check-in and shows the souls count (11.3)', async () => {
    setup(
      () =>
        hostReply([
          { name: 'Ada', at: '2025-10-31T20:00:00.000Z' },
          { name: 'Bo', at: '2025-10-31T20:01:00.000Z' },
        ]),
      true,
    );
    await mount();
    expect(screen.getAllByTestId('candle-lit')).toHaveLength(2);
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Bo')).toBeTruthy();
    expect(screen.getByTestId('seance-souls').textContent).toBe('2 souls present');
  });

  it('says "1 soul present" for one check-in', async () => {
    setup(() => hostReply([{ name: 'Ada', at: '2025-10-31T20:00:00.000Z' }]), true);
    await mount();
    expect(screen.getByTestId('seance-souls').textContent).toBe('1 soul present');
  });

  it('lights a new candle on the next poll', async () => {
    let list = [{ name: 'Ada', at: '2025-10-31T20:00:00.000Z' }];
    setup(() => hostReply(list), true);
    await mount();
    expect(screen.getAllByTestId('candle-lit')).toHaveLength(1);
    list = [...list, { name: 'Bo', at: '2025-10-31T20:01:00.000Z' }];
    await flush(2100);
    expect(screen.getAllByTestId('candle-lit')).toHaveLength(2);
  });

  it('shows the no-signal message and keeps the last list when a poll fails (11.8)', async () => {
    let fail = false;
    setup(() => (fail ? 'network' : hostReply([{ name: 'Ada', at: '2025-10-31T20:00:00.000Z' }])), true);
    await mount();
    expect(screen.queryByTestId('seance-no-signal')).toBeNull();
    fail = true;
    await flush(2100);
    expect(screen.getByTestId('seance-no-signal').textContent).toBe(MSG_POLL_NO_SIGNAL);
    expect(screen.getAllByTestId('candle-lit')).toHaveLength(1);
  });

  it('renders a <script> Title and name as literal text (19.4)', async () => {
    const evilTitle = '<script>window.__pwned = 1</script>';
    const evilName = '<script>alert(1)</script>';
    const rig = setup(
      () => ({
        status: 200,
        body: { title: evilTitle, open: true, checkIns: [{ name: evilName, at: '2025-10-31T20:00:00.000Z' }] },
      }),
      false,
    );
    rig.storage.data.set(HOST_KEY, JSON.stringify({ ...RECORD, title: evilTitle }));
    const { container } = render(createElement(SeanceHost, { onLeave: () => undefined }));
    await flush();
    expect(screen.getByTestId('seance-title').textContent).toBe(evilTitle);
    expect(screen.getByText(evilName)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__pwned']).toBeUndefined();
  });
});

describe('SeanceHost: CSV download', () => {
  it('saves the CSV with a BOM and the file name from the Session_ID (4.8)', async () => {
    const rig = setup(() => hostReply([{ name: 'Ada', at: '2025-10-31T20:00:00.000Z' }]), true);
    await mount();
    fireEvent.click(screen.getByTestId('seance-download'));
    expect(rig.saveFile).toHaveBeenCalledTimes(1);
    const [filename, text] = rig.saveFile.mock.calls[0] as [string, string];
    expect(filename).toBe(`seance-${RECORD.sessionId}.csv`);
    expect(text.startsWith('\uFEFFname,checked_in_at')).toBe(true);
    expect(text).toContain('Ada,2025-10-31T20:00:00.000Z');
    expect(screen.queryByTestId('seance-download-error')).toBeNull();
  });

  it('shows an error and saves nothing before any poll has answered (4.9)', async () => {
    const rig = setup(() => 'hang', true);
    await mount();
    fireEvent.click(screen.getByTestId('seance-download'));
    expect(rig.saveFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('seance-download-error').textContent).toMatch(/No attendance has been received/);
  });
});

describe('SeanceHost: End_Hold', () => {
  it('a tap does not end the séance', async () => {
    const rig = setup(() => hostReply([]), true);
    await mount();
    fireEvent.click(screen.getByTestId('seance-end'));
    await flush(HOLD_DURATION_MS * 2);
    expect(rig.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('says no signal when the end request cannot reach the server, and stays open (12.7)', async () => {
    setup((c) => (c.method === 'POST' ? 'network' : hostReply([])), true);
    await mount();
    await holdEnd();
    expect(screen.getByTestId('seance-end-error').textContent).toBe(MSG_END_NO_SIGNAL);
    expect(screen.getByTestId('seance-end')).toBeTruthy();
    expect(screen.queryByTestId('seance-ended')).toBeNull();
  });

  it('says the server rejected the request on an HTTP error, with no status code (12.8)', async () => {
    setup((c) => (c.method === 'POST' ? { status: 500, body: {} } : hostReply([])), true);
    await mount();
    await holdEnd();
    expect(screen.getByTestId('seance-end-error').textContent).toBe(MSG_END_FAILED);
    expect(screen.getByTestId('seance-end-error').textContent).not.toMatch(/500/);
  });

  it('shows the ended view with the final count on success and clears storage', async () => {
    const rig = setup(
      (c) => (c.method === 'POST' ? { status: 200, body: { count: 3 } } : hostReply([])),
      true,
    );
    await mount();
    await holdEnd();
    expect(screen.getByTestId('seance-ended')).toBeTruthy();
    expect(screen.getByTestId('seance-final-count').textContent).toBe('3 souls present');
    expect(rig.storage.data.has(HOST_KEY)).toBe(false);
  });
});

describe('CandleCircle', () => {
  it('draws names as text, never markup (19.4)', () => {
    const { container } = render(
      createElement(CandleCircle, { candles: [{ name: '<img src=x onerror=alert(1)>' }], reducedMotion: true }),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('keeps the flame still when motion is reduced', () => {
    render(createElement(CandleCircle, { candles: [{ name: 'Ada' }], reducedMotion: true }));
    expect(screen.getByTestId('seance-flame').getAttribute('class')).toContain('is-still');
  });
});
