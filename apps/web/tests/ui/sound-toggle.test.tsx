// Feature: haunting-sounds, task 10.1: SoundToggle (Requirements 9.2-9.6, 9.8, 9.11, 10.2)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const KEY = 'screech.sound';

interface Store {
  readonly data: Map<string, string>;
  readonly setItem: ReturnType<typeof vi.fn>;
}

function installStorage(
  initial: Record<string, string>,
  opts: { failRead?: boolean; failWrite?: boolean } = {},
): Store {
  const data = new Map<string, string>(Object.entries(initial));
  const setItem = vi.fn((k: string, v: string) => {
    if (opts.failWrite) throw new Error('quota');
    data.set(k, v);
  });
  const storage = {
    getItem: (k: string): string | null => {
      if (opts.failRead) throw new Error('denied');
      return data.get(k) ?? null;
    },
    setItem,
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return { data, setItem };
}

async function load() {
  vi.resetModules();
  const toggle = (await import('../../src/ui/components/SoundToggle')).default;
  return toggle;
}

afterEach(() => {
  cleanup();
});

describe('SoundToggle', () => {
  it('defaults to on without writing storage (9.5)', async () => {
    const s = installStorage({});
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    expect(sw.textContent).toBe('Sound: on');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(s.setItem).not.toHaveBeenCalled();
  });

  it('shows off when the saved value is exactly "0" (9.2, 9.3)', async () => {
    installStorage({ [KEY]: '0' });
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    expect(sw.textContent).toBe('Sound: off');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('flips on click, updates label and saves 0 then 1 (9.6)', async () => {
    const s = installStorage({});
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Sound: off');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(s.data.get(KEY)).toBe('0');
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Sound: on');
    expect(s.data.get(KEY)).toBe('1');
  });

  it('is a native button, so Enter and Space activate it (9.6)', async () => {
    installStorage({});
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    expect(sw.tagName).toBe('BUTTON');
    expect(sw.getAttribute('type')).toBe('button');
  });

  it('has the .hit target class and no emoji (9.4)', async () => {
    installStorage({});
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    expect(sw.classList.contains('hit')).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(sw.textContent ?? '')).toBe(false);
  });

  it('works before Awaken: no audio context is created (9.11)', async () => {
    installStorage({});
    const ctor = vi.fn();
    Object.defineProperty(window, 'AudioContext', { value: ctor, configurable: true });
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').textContent).toBe('Sound: off');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('falls back to on when storage read throws (9.8)', async () => {
    installStorage({}, { failRead: true });
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    expect(screen.getByRole('switch').textContent).toBe('Sound: on');
  });

  it('still toggles in memory when storage write throws (9.8)', async () => {
    installStorage({}, { failWrite: true });
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Sound: off');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(sw);
    expect(sw.textContent).toBe('Sound: on');
  });

  it('does not touch the Exorcise key or attribute (10.2)', async () => {
    const s = installStorage({ 'screech.exorcise': '1' });
    document.documentElement.setAttribute('data-exorcise', 'true');
    const SoundToggle = await load();
    render(createElement(SoundToggle));
    fireEvent.click(screen.getByRole('switch'));
    expect(s.data.get('screech.exorcise')).toBe('1');
    expect(document.documentElement.getAttribute('data-exorcise')).toBe('true');
    document.documentElement.removeAttribute('data-exorcise');
  });
});
