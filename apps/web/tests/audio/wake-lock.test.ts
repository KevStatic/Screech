import { describe, expect, it, vi } from 'vitest';
import { createWakeController, type WakeStatus } from '../../src/audio/wake-lock';

class FakeSentinel {
  releaseCalls = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly failRelease = false) {}
  release(): Promise<void> {
    this.releaseCalls += 1;
    return this.failRelease ? Promise.reject(new Error('already released')) : Promise.resolve();
  }
  addEventListener(_type: 'release', cb: () => void): void {
    this.listeners.add(cb);
  }
  removeEventListener(_type: 'release', cb: () => void): void {
    this.listeners.delete(cb);
  }
  /** Simulates the browser dropping the lock (tab hidden, battery saver). */
  browserRelease(): void {
    for (const cb of [...this.listeners]) cb();
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

function fakeNav(behaviour: 'grant' | 'reject') {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async (_type: 'screen') => {
    if (behaviour === 'reject') throw new DOMException('denied', 'NotAllowedError');
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  const nav = { wakeLock: { request } } as unknown as Navigator;
  return { nav, request, sentinels };
}

describe('createWakeController', () => {
  it('acquire resolves held when the request is granted', async () => {
    const { nav, request } = fakeNav('grant');
    const wake = createWakeController(nav);
    expect(await wake.acquire()).toBe('held');
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('acquire resolves rejected when the request is refused', async () => {
    const { nav } = fakeNav('reject');
    expect(await createWakeController(nav).acquire()).toBe('rejected');
  });

  it('acquire resolves unsupported without a wakeLock API', async () => {
    expect(await createWakeController({} as unknown as Navigator).acquire()).toBe('unsupported');
    expect(await createWakeController(undefined).acquire()).toBe('unsupported');
    const noRequest = { wakeLock: {} } as unknown as Navigator;
    expect(await createWakeController(noRequest).acquire()).toBe('unsupported');
  });

  it('acquire while held does not request a second lock', async () => {
    const { nav, request } = fakeNav('grant');
    const wake = createWakeController(nav);
    await wake.acquire();
    expect(await wake.acquire()).toBe('held');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a browser-initiated release notifies listeners with released', async () => {
    const { nav, sentinels } = fakeNav('grant');
    const wake = createWakeController(nav);
    const seen: WakeStatus[] = [];
    wake.onChange((s) => seen.push(s));
    await wake.acquire();
    sentinels[0]!.browserRelease();
    expect(seen).toEqual(['released']);
  });

  it('after a browser release the lock can be acquired again', async () => {
    const { nav, request, sentinels } = fakeNav('grant');
    const wake = createWakeController(nav);
    await wake.acquire();
    sentinels[0]!.browserRelease();
    expect(await wake.acquire()).toBe('held');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('an unsubscribed listener is not called', async () => {
    const { nav, sentinels } = fakeNav('grant');
    const wake = createWakeController(nav);
    const cb = vi.fn();
    const off = wake.onChange(cb);
    off();
    await wake.acquire();
    sentinels[0]!.browserRelease();
    expect(cb).not.toHaveBeenCalled();
  });

  it('release after acquire releases the sentinel and emits nothing', async () => {
    const { nav, sentinels } = fakeNav('grant');
    const wake = createWakeController(nav);
    const cb = vi.fn();
    wake.onChange(cb);
    await wake.acquire();
    await wake.release();
    expect(sentinels[0]!.releaseCalls).toBe(1);
    expect(sentinels[0]!.listenerCount).toBe(0);
    expect(cb).not.toHaveBeenCalled();
  });

  it('release twice releases the sentinel once', async () => {
    const { nav, sentinels } = fakeNav('grant');
    const wake = createWakeController(nav);
    await wake.acquire();
    await wake.release();
    await wake.release();
    expect(sentinels[0]!.releaseCalls).toBe(1);
  });

  it('release resolves when the sentinel release throws', async () => {
    const request = vi.fn(async () => new FakeSentinel(true));
    const wake = createWakeController({ wakeLock: { request } } as unknown as Navigator);
    await wake.acquire();
    await expect(wake.release()).resolves.toBeUndefined();
  });

  it('release without acquire resolves and does nothing', async () => {
    const { nav, request } = fakeNav('grant');
    const wake = createWakeController(nav);
    await expect(wake.release()).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    await expect(createWakeController({} as unknown as Navigator).release()).resolves.toBeUndefined();
  });

  it('a lock granted after release() was called is handed back', async () => {
    const sentinel = new FakeSentinel();
    let grant: (s: FakeSentinel) => void = () => undefined;
    const request = vi.fn(() => new Promise<FakeSentinel>((r) => (grant = r)));
    const wake = createWakeController({ wakeLock: { request } } as unknown as Navigator);
    const pending = wake.acquire();
    await wake.release();
    grant(sentinel);
    expect(await pending).toBe('released');
    expect(sentinel.releaseCalls).toBe(1);
  });
});
