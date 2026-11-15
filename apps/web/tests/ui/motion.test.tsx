import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const KEY = 'screech.exorcise';

interface FakeMedia {
  matches: boolean;
  addEventListener: (type: string, fn: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: () => void;
}

let media: FakeMedia;
let changeListeners: Array<(e: MediaQueryListEvent) => void>;
let store: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;

function installMatchMedia(matches: boolean): void {
  changeListeners = [];
  media = {
    matches,
    addEventListener: (_t, fn) => {
      changeListeners.push(fn);
    },
    removeEventListener: () => undefined,
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => media,
  });
}

function installStorage(initial: Record<string, string> = {}): void {
  store = new Map(Object.entries(initial));
  setItem = vi.fn((k: string, v: string) => {
    store.set(k, v);
  });
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem,
      removeItem: (k: string) => store.delete(k),
    },
  });
}

function installThrowingStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
}

function fireSystemChange(matches: boolean): void {
  media.matches = matches;
  act(() => {
    changeListeners.forEach((fn) => fn({ matches } as MediaQueryListEvent));
  });
}

async function load() {
  vi.resetModules();
  const motion = await import('../../src/ui/hooks/useMotion');
  const toggle = (await import('../../src/ui/components/ExorciseToggle')).default;
  return { ...motion, ExorciseToggle: toggle };
}

const attr = (): string | undefined => document.documentElement.dataset.reducedMotion;

beforeEach(() => {
  delete document.documentElement.dataset.reducedMotion;
  installMatchMedia(false);
  installStorage();
});

afterEach(() => {
  cleanup();
});

describe('motion: saved value (3.2, 3.3)', () => {
  it('applies a saved "on" to <html> before first render', async () => {
    installStorage({ [KEY]: '1' });
    const { initMotion } = await load();
    initMotion();
    expect(attr()).toBe('true');
  });

  it('is off when nothing is saved', async () => {
    const { initMotion } = await load();
    initMotion();
    expect(attr()).toBe('false');
  });

  it('treats odd stored values as off', async () => {
    for (const odd of ['true', 'yes', '2', '', '{"on":1}']) {
      installStorage({ [KEY]: odd });
      const { initMotion } = await load();
      delete document.documentElement.dataset.reducedMotion;
      initMotion();
      expect(attr()).toBe('false');
    }
  });

  it('falls back to off when storage throws, and the toggle still works', async () => {
    installThrowingStorage();
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    expect(attr()).toBe('false');
    render(createElement(ExorciseToggle));
    fireEvent.click(screen.getByRole('switch'));
    expect(attr()).toBe('true');
    expect(screen.getByRole('switch').textContent).toBe('Exorcise: on');
  });

  it('keeps working when setItem throws', async () => {
    installStorage();
    setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    render(createElement(ExorciseToggle));
    fireEvent.click(screen.getByRole('switch'));
    expect(attr()).toBe('true');
  });
});

describe('motion: system preference (3.4, 3.5)', () => {
  it('disables the toggle, shows it on and explains why', async () => {
    installMatchMedia(true);
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    expect(attr()).toBe('true');
    render(createElement(ExorciseToggle));
    const sw = screen.getByRole('switch') as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.textContent).toBe('Exorcise: on');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('System setting is in effect.')).toBeTruthy();
  });

  it('does not show the system note when the system setting is off', async () => {
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    render(createElement(ExorciseToggle));
    expect(screen.queryByText('System setting is in effect.')).toBeNull();
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
  });

  it('updates the attribute on a matchMedia change without clearing the saved value', async () => {
    installStorage({ [KEY]: '0' });
    const { initMotion } = await load();
    initMotion();
    expect(attr()).toBe('false');
    fireSystemChange(true);
    expect(attr()).toBe('true');
    fireSystemChange(false);
    expect(attr()).toBe('false');
    expect(store.get(KEY)).toBe('0');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps a saved "on" when the system setting turns off', async () => {
    installMatchMedia(true);
    installStorage({ [KEY]: '1' });
    const { initMotion } = await load();
    initMotion();
    fireSystemChange(false);
    expect(attr()).toBe('true');
    expect(store.get(KEY)).toBe('1');
  });

  it('re-renders the mounted toggle on a system change', async () => {
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    render(createElement(ExorciseToggle));
    fireSystemChange(true);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('System setting is in effect.')).toBeTruthy();
  });
});

describe('Exorcise toggle (3.6)', () => {
  it('updates the label and the attribute and writes storage on tap', async () => {
    const { initMotion, ExorciseToggle } = await load();
    initMotion();
    render(createElement(ExorciseToggle));
    const sw = screen.getByRole('switch');
    expect(sw.textContent).toBe('Exorcise: off');
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Exorcise: on');
    expect(attr()).toBe('true');
    expect(store.get(KEY)).toBe('1');
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Exorcise: off');
    expect(attr()).toBe('false');
    expect(store.get(KEY)).toBe('0');
  });
});
