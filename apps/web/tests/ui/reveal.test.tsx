import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Payload } from '@screech/core';
import Reveal from '../../src/ui/screens/Reveal';
import Garbled, { MSG_GARBLED } from '../../src/ui/screens/Garbled';
import Sealed, { MSG_SEALED } from '../../src/ui/screens/Sealed';
import ActionCard from '../../src/ui/components/ActionCard';
import { INITIAL_FLOW_STATE, type FlowState } from '../../src/logic/flow';
import { setExorcise } from '../../src/ui/hooks/useMotion';
import { buildContactText } from '../../src/logic/contact';

function revealState(payload: Payload): FlowState {
  return {
    ...INITIAL_FLOW_STATE,
    screen: 'reveal',
    received: { kind: 'reveal', packet: { multipart: false, payload } },
  } as unknown as FlowState;
}

function renderReveal(payload: Payload) {
  const dispatch = vi.fn();
  render(<Reveal flow={{ state: revealState(payload), dispatch }} />);
  return { dispatch };
}

const TEXT: Payload = { type: 'text', text: 'HELLO WORLD' } as Payload;
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}
const spelled = (): string => screen.getByTestId('ouija-spelled').textContent ?? '';

beforeEach(() => {
  setExorcise(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
});

afterEach(() => {
  cleanup();
  setExorcise(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Reveal spelling', () => {
  it('has the full text hidden from the first frame and spells at about 12 characters per second', () => {
    renderReveal(TEXT);
    expect(screen.getByTestId('reveal-full-text').textContent).toBe('HELLO WORLD');
    expect(spelled()).toBe('');
    expect(screen.queryByText('HELLO WORLD', { selector: '.action-card p' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(spelled()).toBe('HELLO');
    expect(screen.getByTestId('reveal-full-text').textContent).toBe('HELLO WORLD');
    expect(document.querySelector('.action-card')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(spelled()).toBe('HELLO WORLD');
    expect(document.querySelector('.action-card')).not.toBeNull();
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
  });

  it('skips on click', () => {
    renderReveal(TEXT);
    fireEvent.click(screen.getByTestId('reveal-skip'));
    expect(spelled()).toBe('HELLO WORLD');
    expect(document.querySelector('.action-card')).not.toBeNull();
  });

  it.each([' ', 'Enter'])('skips on key %j', (key) => {
    renderReveal(TEXT);
    fireEvent.keyDown(screen.getByTestId('reveal-skip'), { key });
    expect(spelled()).toBe('HELLO WORLD');
    expect(document.querySelector('.action-card')).not.toBeNull();
  });

  it('shows everything at once under reduced motion', () => {
    setExorcise(true);
    renderReveal(TEXT);
    expect(spelled()).toBe('HELLO WORLD');
    expect(document.querySelector('.action-card')).not.toBeNull();
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
  });

  it('has controls back to Listen and Speak', () => {
    const { dispatch } = renderReveal(TEXT);
    fireEvent.click(screen.getByTestId('reveal-back-listen'));
    fireEvent.click(screen.getByTestId('reveal-back-speak'));
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'back', target: 'listen' });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'back', target: 'speak' });
  });

  it('renders a payload with markup as text, never as an element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    setExorcise(true);
    renderReveal({ type: 'text', text: evil } as Payload);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('.action-card')?.textContent).not.toContain(evil);
    expect(screen.getByTestId('reveal-full-text').textContent).toBe(evil);
  });
});

describe('ActionCard', () => {
  it.each(['text', 'checkin', 'hunt-clue'] as const)(
    '%s shows a Copy text button and does not repeat the text',
    async (type) => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<ActionCard payload={{ type, text: 'plain words' } as Payload} />);
      expect(screen.queryByText('plain words')).toBeNull();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));
      });
      expect(writeText).toHaveBeenCalledWith('plain words');
      expect(screen.getByRole('status').textContent).toBe('Text copied.');
    },
  );
  it('shows the text for hand copying when Copy text fails', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ActionCard payload={{ type: 'text', text: 'plain words' } as Payload} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    });
    expect(screen.getByText('plain words')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Copying failed/);
  });
  it('wifi: network name is large, steps are shown, Copy password comes first, QR is hidden', () => {
    render(
      <ActionCard payload={{ type: 'wifi', ssid: 'CoffeeNet', password: 'hunter2', security: 'wpa' } as Payload} />,
    );
    expect(screen.getByTestId('wifi-ssid').textContent).toBe('CoffeeNet');
    expect(screen.getByTestId('wifi-steps').textContent).toBe(
      'Open Wi-Fi settings, choose CoffeeNet, paste the password.',
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]?.textContent).toBe('Copy password');
    expect(buttons[0]?.className).not.toContain('secondary');
    expect(document.querySelector('canvas.wifi-qr')).toBeNull();
  });
  it('wifi: the QR appears only after "Show QR for someone else" and hides again', () => {
    render(
      <ActionCard payload={{ type: 'wifi', ssid: 'CoffeeNet', password: 'hunter2', security: 'wpa' } as Payload} />,
    );
    const toggle = screen.getByRole('button', { name: 'Show QR for someone else' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(document.querySelector('canvas.wifi-qr, [aria-label="QR code to join CoffeeNet"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide QR' }));
    expect(document.querySelector('canvas.wifi-qr')).toBeNull();
  });
  it('wifi: an open network has steps without a password', () => {
    render(<ActionCard payload={{ type: 'wifi', ssid: 'Free', password: '', security: 'open' } as Payload} />);
    expect(screen.getByTestId('wifi-steps').textContent).toBe('Open Wi-Fi settings, choose Free.');
  });

  it('opens a safe url only on tap, with noopener', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<ActionCard payload={{ type: 'url', url: 'https://example.com/a' } as Payload} />);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open link' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });

  it('refuses an unsafe url scheme and says why', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<ActionCard payload={{ type: 'url', url: 'javascript:alert(1)' } as Payload} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('not safe to open');
    expect(open).not.toHaveBeenCalled();
  });

  it('shows wifi details and copies the password', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ActionCard payload={{ type: 'wifi', ssid: 'CoffeeNet', password: 'hunter2', security: 'wpa' } as Payload} />,
    );
    expect(screen.getByText('CoffeeNet')).toBeTruthy();
    expect(screen.getByText('WPA')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    });
    expect(writeText).toHaveBeenCalledWith('hunter2');
    expect(screen.getByRole('status').textContent).toBe('Password copied.');
  });

  it('reports a failed copy and shows the password for manual copy', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <ActionCard payload={{ type: 'wifi', ssid: 'CoffeeNet', password: 'hunter2', security: 'wpa' } as Payload} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    });
    expect(screen.getByText('hunter2')).toBeTruthy();
    expect(screen.getByText(/Copying failed/)).toBeTruthy();
  });

  it('omits the copy control for an open network', () => {
    render(<ActionCard payload={{ type: 'wifi', ssid: 'Free', password: '', security: 'open' } as Payload} />);
    expect(screen.queryByRole('button', { name: 'Copy password' })).toBeNull();
    expect(screen.getByText('Open (no password)')).toBeTruthy();
  });

  it('shows contact fields, omits absent ones, and downloads text/vcard', async () => {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:fake';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const text = buildContactText({ name: 'Ada', phone: '', email: 'ada@example.com' });
    render(<ActionCard payload={{ type: 'contact', text } as Payload} />);
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.queryByText('Phone: ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Download contact/ }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('text/vcard');
    expect(await readBlob(blobs[0] as Blob)).toContain('FN:Ada');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('shows the unreadable-contact message with the raw text', () => {
    render(<ActionCard payload={{ type: 'contact', text: '  ' } as Payload} />);
    expect(screen.getByRole('alert').textContent).toContain('could not be read');
  });
});

describe('Garbled and Sealed', () => {
  it('Garbled shows its message and returns to Listen', () => {
    const dispatch = vi.fn();
    render(<Garbled flow={{ dispatch }} />);
    expect(MSG_GARBLED).toBe('This message arrived damaged.');
    expect(screen.getByText('This message arrived damaged.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('garbled-back'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'back', target: 'listen' });
  });

  it('Sealed shows its exact message and returns to Listen', () => {
    const dispatch = vi.fn();
    render(<Sealed flow={{ dispatch }} />);
    expect(MSG_SEALED).toBe('A sealed message. Join the pact to read it.');
    expect(screen.getByText('A sealed message. Join the pact to read it.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sealed-back'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'back', target: 'listen' });
  });
});
