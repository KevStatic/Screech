// Feature: haunting-sounds, task 10.2: SoundHint (Requirements 12.1-12.6, 12.8, 12.9, 12.14)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const HINT_KEY = 'screech.sound-hint';
const TEXT = 'On iPhone, the silent switch mutes these sounds.';

function installStorage(initial: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial));
  const setItem = vi.fn((k: string, v: string) => {
    data.set(k, v);
  });
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: (k: string): string | null => data.get(k) ?? null, setItem },
    configurable: true,
  });
  return { data, setItem };
}

function setIos(ios: boolean): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' : 'Mozilla/5.0 (Linux; Android 14)',
    configurable: true,
  });
}

async function load() {
  vi.resetModules();
  const hint = await import('../../src/ui/hooks/useSoundHint');
  const pref = await import('../../src/ui/hooks/useSoundPref');
  const SoundHint = (await import('../../src/ui/components/SoundHint')).default;
  return { SoundHint, markAwakenTapped: hint.markAwakenTapped, setSound: pref.setSound };
}

afterEach(() => {
  cleanup();
});

describe('SoundHint', () => {
  it('renders nothing before the Awaken tap (12.5)', async () => {
    installStorage({});
    setIos(true);
    const { SoundHint } = await load();
    render(createElement(SoundHint));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the exact text as a status with a .hit dismiss button after the tap on iOS (12.1)', async () => {
    const s = installStorage({});
    setIos(true);
    const { SoundHint, markAwakenTapped } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    const status = screen.getByRole('status');
    expect(status.textContent).toContain(TEXT);
    expect(status.classList.contains('note')).toBe(true);
    expect(status.getAttribute('aria-modal')).toBeNull();
    const btn = screen.getByRole('button');
    expect(btn.classList.contains('hit')).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(status.textContent ?? '')).toBe(false);
    expect(s.setItem).toHaveBeenCalledTimes(1);
    expect(s.setItem).toHaveBeenCalledWith(HINT_KEY, '1');
  });

  it('does not steal focus or open a dialog (12.8)', async () => {
    installStorage({});
    setIos(true);
    const { SoundHint, markAwakenTapped } = await load();
    render(createElement(SoundHint));
    const before = document.activeElement;
    act(() => markAwakenTapped());
    expect(document.activeElement).toBe(before);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts no audio (12.8)', async () => {
    installStorage({});
    setIos(true);
    const ctor = vi.fn();
    Object.defineProperty(window, 'AudioContext', { value: ctor, configurable: true });
    const { SoundHint, markAwakenTapped } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    expect(ctor).not.toHaveBeenCalled();
  });

  it('dismiss hides it for the session (12.2, 12.14)', async () => {
    installStorage({});
    setIos(true);
    const { SoundHint, markAwakenTapped, setSound } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setSound(false));
    act(() => setSound(true));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays hidden when a value is already saved (12.3)', async () => {
    installStorage({ [HINT_KEY]: '1' });
    setIos(true);
    const { SoundHint, markAwakenTapped } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays hidden when not iOS (12.4)', async () => {
    installStorage({});
    setIos(false);
    const { SoundHint, markAwakenTapped } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides while Sound is off and returns when on again until dismissed (12.6)', async () => {
    installStorage({});
    setIos(true);
    const { SoundHint, markAwakenTapped, setSound } = await load();
    render(createElement(SoundHint));
    act(() => markAwakenTapped());
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => setSound(false));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setSound(true));
    expect(screen.queryByRole('status')).not.toBeNull();
  });
});
