// Feature: seance, task 11.8: Join and Lit screens
// (Requirements 13.3-13.8, 14.1-14.3, 14.7, 14.8, 15.2-15.4, 16.1, 16.3, 16.5-16.7)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import Join from '../../src/ui/screens/Join';
import Lit from '../../src/ui/screens/Lit';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import {
  MSG_CODE_EXPIRED,
  MSG_ENDED,
  MSG_JOIN_FAILED,
  MSG_JOIN_NO_SIGNAL,
  MSG_JOIN_SERVER,
  MSG_NAME_LENGTH,
  MSG_NOT_FOUND,
  MSG_PUBLIC_NO_SIGNAL,
} from '../../src/logic/checkin-client';
import type { FetchLike } from '../../src/logic/checkin-client';
import { LAST_NAME_KEY } from '../../src/logic/seance-storage';
import type { StorageLike } from '../../src/logic/seance-storage';
import type { CheckinFields } from '@screech/core';

const FIELDS = { sessionId: 'ABCD2345', code: '123456' } as unknown as CheckinFields;

interface Reply {
  readonly status: number;
  readonly body: unknown;
}
type Responder = () => Reply | Promise<Reply>;

function asResponse(r: Reply): Response {
  return {
    status: r.status,
    json: () => Promise.resolve(r.body),
    headers: { get: () => null },
  } as unknown as Response;
}

interface Api {
  readonly fetch: FetchLike;
  readonly calls: Array<{ url: string; init?: RequestInit }>;
  publicCalls: () => number;
  checkinCalls: () => number;
}

function makeApi(handlers: { pub?: Responder; checkin?: Responder }): Api {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/public')) {
      return asResponse(await (handlers.pub ?? (() => ({ status: 200, body: { title: 'Midnight Circle', open: true } })))());
    }
    if (url.endsWith('/checkin')) {
      return asResponse(
        await (handlers.checkin ??
          (() => ({ status: 200, body: { name: 'Ada', at: '2026-01-01T00:00:00Z', alreadyCheckedIn: false } })))(),
      );
    }
    throw new Error(`unexpected url ${url}`);
  };
  return {
    fetch: fetchFn,
    calls,
    publicCalls: () => calls.filter((c) => c.url.endsWith('/public')).length,
    checkinCalls: () => calls.filter((c) => c.url.endsWith('/checkin')).length,
  };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

interface Opts {
  api?: Api;
  local?: StorageLike | null;
  onLeave?: () => void;
  onListenAgain?: (name: string) => void;
}

function renderJoin(opts: Opts = {}) {
  const api = opts.api ?? makeApi({});
  const onLeave = opts.onLeave ?? vi.fn();
  const onListenAgain = opts.onListenAgain ?? vi.fn();
  const local = opts.local === undefined ? memoryStorage() : opts.local;
  render(
    createElement(Join, {
      initial: FIELDS,
      onLeave,
      onListenAgain,
      deps: { fetch: api.fetch, local, randomBytes: (n: number) => new Uint8Array(n).fill(7) },
    }),
  );
  return { api, onLeave, onListenAgain, local };
}

function typeName(value: string): void {
  fireEvent.change(screen.getByTestId('join-name'), { target: { value } });
}

async function openJoin(opts: Opts = {}) {
  const ctx = renderJoin(opts);
  await waitFor(() => expect(screen.getByTestId('join-button')).toBeTruthy());
  return ctx;
}

beforeEach(() => {
  setExorcise(false);
});

afterEach(() => {
  cleanup();
  setExorcise(false);
});

describe('Join: public request states (13.3 to 13.8)', () => {
  it('shows the reaching text and no Join button while the request is pending', async () => {
    const api = makeApi({ pub: () => new Promise<Reply>(() => undefined) });
    renderJoin({ api });
    expect(screen.getByTestId('join-title').textContent).toBe('Reaching the séance...');
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.queryByTestId('join-name')).toBeNull();
    await waitFor(() => expect(api.publicCalls()).toBe(1));
    expect(api.calls[0]?.url).toBe('/api/seance/ABCD2345/public');
  });

  it('shows the Title and the Join form when the séance is open', async () => {
    await openJoin();
    expect(screen.getByTestId('join-title').textContent).toBe('Midnight Circle');
    expect(screen.queryByTestId('join-notice')).toBeNull();
    expect(screen.getByTestId('join-leave')).toBeTruthy();
  });

  it('shows the ended message and no Join form when the séance has ended', async () => {
    renderJoin({ api: makeApi({ pub: () => ({ status: 200, body: { title: 'Old Circle', open: false } }) }) });
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_ENDED));
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.getByTestId('join-leave')).toBeTruthy();
  });

  it('shows the not-found message and no Join form on a 404', async () => {
    renderJoin({ api: makeApi({ pub: () => ({ status: 404, body: { error: 'x' } }) }) });
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_NOT_FOUND));
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.queryByTestId('join-retry-public')).toBeNull();
  });

  it('shows no-signal with Retry on a network error, and Retry asks again', async () => {
    let fail = true;
    const api = makeApi({
      pub: () => {
        if (fail) throw new Error('offline');
        return { status: 200, body: { title: 'Midnight Circle', open: true } };
      },
    });
    renderJoin({ api });
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_PUBLIC_NO_SIGNAL));
    expect(screen.queryByTestId('join-button')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByTestId('join-retry-public'));
    await waitFor(() => expect(screen.getByTestId('join-button')).toBeTruthy());
    expect(api.publicCalls()).toBe(2);
    expect(screen.getByTestId('join-title').textContent).toBe('Midnight Circle');
  });

  it('treats a server error on the public request as no signal', async () => {
    renderJoin({ api: makeApi({ pub: () => ({ status: 500, body: {} }) }) });
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_PUBLIC_NO_SIGNAL));
    expect(screen.getByTestId('join-retry-public')).toBeTruthy();
  });
});

describe('Join: name field (14.1 to 14.3)', () => {
  it('prefills the saved name and shows the remaining count', async () => {
    await openJoin({ local: memoryStorage({ [LAST_NAME_KEY]: 'Ada' }) });
    expect((screen.getByTestId('join-name') as HTMLInputElement).value).toBe('Ada');
    expect(screen.getByTestId('join-remaining').textContent).toBe('29 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('starts empty with Join disabled when nothing is saved', async () => {
    await openJoin();
    expect((screen.getByTestId('join-name') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('join-remaining').textContent).toBe('32 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('join-name-message')).toBeNull();
  });
  it('shows the name error only after the attendee has typed in the field', async () => {
    await openJoin();
    expect(screen.queryByTestId('join-name-message')).toBeNull();
    fireEvent.change(screen.getByTestId('join-name'), { target: { value: 'Ada' } });
    expect(screen.queryByTestId('join-name-message')).toBeNull();
    fireEvent.change(screen.getByTestId('join-name'), { target: { value: '' } });
    expect(screen.getByTestId('join-name-message').textContent).toBe('The name must be 1 to 32 characters.');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('counts remaining by trimmed code points and enforces the 1 to 32 bounds', async () => {
    await openJoin();
    typeName('  ' + 'a'.repeat(32) + '  ');
    expect(screen.getByTestId('join-remaining').textContent).toBe('0 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(false);

    typeName('a'.repeat(33));
    expect(screen.getByTestId('join-remaining').textContent).toBe('-1 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('join-name-message')).toBeTruthy();

    // Astral characters count as one code point each.
    typeName('\u{1F47B}'.repeat(32));
    expect(screen.getByTestId('join-remaining').textContent).toBe('0 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(false);

    typeName('   ');
    expect(screen.getByTestId('join-remaining').textContent).toBe('32 left');
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not send a request when the name is invalid', async () => {
    const { api } = await openJoin();
    fireEvent.click(screen.getByTestId('join-button'));
    expect(api.checkinCalls()).toBe(0);
  });
});

describe('Join: joining and errors (14.7, 14.8, 16.1, 16.3, 16.5 to 16.7)', () => {
  it('shows a disabled "Joining..." button while pending and sends one request', async () => {
    let release: (r: Reply) => void = () => undefined;
    const api = makeApi({ checkin: () => new Promise<Reply>((res) => (release = res)) });
    await openJoin({ api });
    typeName('Ada');
    const button = screen.getByTestId('join-button') as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe('Joining...'));
    expect(button.disabled).toBe(true);
    expect(api.checkinCalls()).toBe(1);

    await act(async () => {
      release({ status: 200, body: { name: 'Ada', at: 'now', alreadyCheckedIn: false } });
    });
    await waitFor(() => expect(screen.getByTestId('lit-name')).toBeTruthy());
    expect(api.checkinCalls()).toBe(1);
  });

  it('sends the code, trimmed name and a device id', async () => {
    const { api } = await openJoin();
    typeName('  Ada  ');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(api.checkinCalls()).toBe(1));
    const call = api.calls.find((c) => c.url.endsWith('/checkin'));
    expect(call?.url).toBe('/api/seance/ABCD2345/checkin');
    const sent = JSON.parse(String(call?.init?.body)) as Record<string, string>;
    expect(sent['code']).toBe('123456');
    expect(sent['name']).toBe('Ada');
    expect(sent['deviceId']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('403 shows the expired-code message and Listen again, and no Retry', async () => {
    const onListenAgain = vi.fn();
    await openJoin({ api: makeApi({ checkin: () => ({ status: 403, body: {} }) }), onListenAgain });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-error').textContent).toBe(MSG_CODE_EXPIRED));
    expect(screen.queryByTestId('join-retry')).toBeNull();
    fireEvent.click(screen.getByTestId('join-listen-again'));
    expect(onListenAgain).toHaveBeenCalledWith('Ada');
  });

  it('410 shows the ended message and hides the Join form', async () => {
    await openJoin({ api: makeApi({ checkin: () => ({ status: 410, body: {} }) }) });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_ENDED));
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('404 shows the not-found message and hides the Join form', async () => {
    await openJoin({ api: makeApi({ checkin: () => ({ status: 404, body: {} }) }) });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-notice').textContent).toBe(MSG_NOT_FOUND));
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('400 shows the name-length message and keeps the form', async () => {
    await openJoin({ api: makeApi({ checkin: () => ({ status: 400, body: {} }) }) });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-error').textContent).toBe(MSG_NAME_LENGTH));
    expect(screen.getByTestId('join-button')).toBeTruthy();
  });

  it.each([
    ['network failure', null, MSG_JOIN_NO_SIGNAL],
    ['500', 500, MSG_JOIN_SERVER],
    ['418', 418, MSG_JOIN_FAILED],
  ])('%s shows a plain message, no status code, and Retry sends a new request', async (_label, status, message) => {
    let first = true;
    const api = makeApi({
      checkin: () => {
        if (first) {
          first = false;
          if (status === null) throw new Error('offline');
          return { status, body: { stack: 'secret' } };
        }
        return { status: 200, body: { name: 'Ada', at: 'now', alreadyCheckedIn: false } };
      },
    });
    await openJoin({ api });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-error').textContent).toBe(message));
    expect(screen.getByTestId('join-error').textContent).not.toMatch(/\d{3}/);
    expect((screen.getByTestId('join-button') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('join-retry'));
    await waitFor(() => expect(screen.getByTestId('lit-name')).toBeTruthy());
    expect(api.checkinCalls()).toBe(2);
  });

  it('clears the previous error when a new request starts', async () => {
    let release: (r: Reply) => void = () => undefined;
    let first = true;
    const api = makeApi({
      checkin: () => {
        if (first) {
          first = false;
          return { status: 500, body: {} };
        }
        return new Promise<Reply>((res) => (release = res));
      },
    });
    await openJoin({ api });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('join-error')).toBeTruthy());
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.queryByTestId('join-error')).toBeNull());
    await act(async () => {
      release({ status: 200, body: { name: 'Ada', at: 'now', alreadyCheckedIn: false } });
    });
  });

  it('Leave calls onLeave and sends no check-in', async () => {
    const { api, onLeave } = await openJoin();
    fireEvent.click(screen.getByTestId('join-leave'));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(api.checkinCalls()).toBe(0);
  });
});

describe('Lit screen (15.2 to 15.4)', () => {
  it('shows the heading, name, Title and a lighting flame on a first check-in', () => {
    render(createElement(Lit, { name: 'Ada', title: 'Midnight Circle', alreadyCheckedIn: false, onBack: () => {} }));
    expect(screen.getByRole('heading').textContent).toBe('Your candle is lit');
    expect(screen.getByTestId('lit-name').textContent).toBe('Ada');
    expect(screen.getByTestId('lit-title').textContent).toBe('Midnight Circle');
    expect(screen.getByTestId('lit-flame').getAttribute('data-animated')).toBe('true');
    expect(screen.queryByTestId('lit-already')).toBeNull();
  });

  it('shows the already-counted note and a still flame on a repeat check-in', () => {
    render(createElement(Lit, { name: 'Ada', title: 'Midnight Circle', alreadyCheckedIn: true, onBack: () => {} }));
    expect(screen.getByTestId('lit-already').textContent).toBe('You were already counted.');
    expect(screen.getByTestId('lit-flame').getAttribute('data-animated')).toBe('false');
  });

  it('keeps the flame still under reduced motion (Exorcise)', () => {
    act(() => setExorcise(true));
    render(createElement(Lit, { name: 'Ada', title: 'T', alreadyCheckedIn: false, onBack: () => {} }));
    expect(screen.getByTestId('lit-flame').getAttribute('data-animated')).toBe('false');
    expect(screen.getByTestId('lit-flame').getAttribute('class')).toContain('is-still');
  });

  it('has only a Back to listening control and calls onBack', () => {
    const onBack = vi.fn();
    render(createElement(Lit, { name: 'Ada', title: 'T', alreadyCheckedIn: false, onBack }));
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('Back to listening');
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the name and Title as literal text', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      createElement(Lit, { name: hostile, title: '<b>t</b>', alreadyCheckedIn: false, onBack: () => {} }),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByTestId('lit-name').textContent).toBe(hostile);
  });
});

describe('Join to Lit (15.2, 14.1)', () => {
  it('shows the server-returned name and Title after a first check-in and saves the name', async () => {
    const local = memoryStorage();
    const api = makeApi({
      checkin: () => ({ status: 200, body: { name: 'Ada L', at: 'now', alreadyCheckedIn: false } }),
    });
    await openJoin({ api, local });
    typeName('Ada L');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('lit-name').textContent).toBe('Ada L'));
    expect(screen.getByTestId('lit-title').textContent).toBe('Midnight Circle');
    expect(screen.queryByTestId('lit-already')).toBeNull();
    expect(local.map.get(LAST_NAME_KEY)).toBe('Ada L');
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('shows the already-counted note after a repeat check-in and the stored name', async () => {
    const api = makeApi({
      checkin: () => ({ status: 200, body: { name: 'Ada', at: 'then', alreadyCheckedIn: true } }),
    });
    await openJoin({ api });
    typeName('Someone Else');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('lit-already')).toBeTruthy());
    expect(screen.getByTestId('lit-name').textContent).toBe('Ada');
  });

  it('Back to listening passes the name to onListenAgain', async () => {
    const onListenAgain = vi.fn();
    await openJoin({ onListenAgain });
    typeName('Ada');
    fireEvent.click(screen.getByTestId('join-button'));
    await waitFor(() => expect(screen.getByTestId('lit-back')).toBeTruthy());
    fireEvent.click(screen.getByTestId('lit-back'));
    expect(onListenAgain).toHaveBeenCalledWith('Ada');
  });
});
