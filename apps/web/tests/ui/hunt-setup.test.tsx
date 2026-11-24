// Feature: ghost-hunt, task 9.7: HuntSetup screen
// (Requirements 2.1, 2.3, 2.9, 2.11, 3.10, 3.12, 3.16, 3.17, 3.19, 3.23, 4.6, 6.8, 6.9, 6.10, 6.11, 6.17)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import HuntSetup, {
  MSG_COPIED,
  MSG_COPY_FAILED,
  MSG_NO_HUNT_ID,
  MSG_PRINT_FAILED,
} from '../../src/ui/screens/HuntSetup';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 400);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(): ReturnType<typeof render> {
  return render(createElement(HuntSetup, { onBack: () => undefined }));
}

const input = (label: string): HTMLInputElement | HTMLTextAreaElement =>
  screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

const type = (label: string, value: string): void => {
  fireEvent.change(input(label), { target: { value } });
};

const huntIdText = (): string => screen.getByTestId('hunt-id').textContent ?? '';

/** Fills every row from the Office pack so all rows are valid. */
function fillOffice(): void {
  fireEvent.click(screen.getByTestId('hunt-pack-office'));
}

const qrImages = (): HTMLElement[] => screen.queryAllByRole('img');

describe('HuntSetup', () => {
  it('shows a Hunt_ID on open', () => {
    open();
    expect(huntIdText()).toMatch(/^Hunt ID: \S+$/);
    expect(huntIdText()).not.toBe('Hunt ID: none');
  });

  it('regenerate makes a new Hunt_ID and keeps the typed rows', () => {
    open();
    type('Spirit 1 name', 'Grim');
    type('Spirit 1 clue', 'Look under the stairs');
    const before = huntIdText();
    fireEvent.click(screen.getByTestId('hunt-regenerate'));
    expect(huntIdText()).not.toBe(before);
    expect(input('Spirit 1 name').value).toBe('Grim');
    expect(input('Spirit 1 clue').value).toBe('Look under the stairs');
  });

  it('disables link controls when crypto.getRandomValues fails', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('no entropy');
    });
    open();
    fillOffice();
    expect(huntIdText()).toBe('Hunt ID: none');
    expect(screen.getByTestId('hunt-id-error').textContent).toBe(MSG_NO_HUNT_ID);
    expect((screen.getByTestId('hunt-print') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('hunt-copy-1')).toBeNull();
    expect(qrImages()).toHaveLength(0);
    expect(input('Spirit 1 name').value).not.toBe('');
  });

  it('shows the opening riddle above the controls', () => {
    open();
    expect(screen.queryByTestId('hunt-opening')).toBeNull();
    type('Opening riddle (read aloud to start)', 'Begin at the door');
    const opening = screen.getByTestId('hunt-opening');
    expect(opening.textContent).toBe('Begin at the door');
    const controls = screen.getByLabelText('Hunt');
    expect(
      opening.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('labels the name field and the spirit index', () => {
    open();
    expect(screen.getByLabelText('Spirit 1 name')).toBeTruthy();
    expect(screen.getByText('Spirit 1 of 5')).toBeTruthy();
    expect(screen.getByLabelText('Spirit 5 name')).toBeTruthy();
    expect(screen.queryByLabelText('Spirit 6 name')).toBeNull();
  });

  it('asks before a pack overwrites typed text, naming the count, and cancel keeps the text', () => {
    open();
    type('Spirit 1 name', 'Grim');
    type('Spirit 2 clue', 'Behind the clock');
    fireEvent.click(screen.getByTestId('hunt-pack-home'));
    expect(screen.getByText('2 fields hold your own text. Replace them with the pack?')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep my text'));
    expect(screen.queryByText(/hold your own text/)).toBeNull();
    expect(input('Spirit 1 name').value).toBe('Grim');
    expect(input('Spirit 2 clue').value).toBe('Behind the clock');
  });

  it('names an incomplete row and shows no QR', () => {
    open();
    fillOffice();
    type('Spirit 2 name', '');
    const summary = screen.getByTestId('hunt-summary').textContent ?? '';
    expect(summary).toContain('Spirit 2 has no name');
    expect(qrImages()).toHaveLength(0);
  });

  it('one error blocks every QR and disables print', () => {
    open();
    fillOffice();
    expect(qrImages()).toHaveLength(5);
    expect((screen.getByTestId('hunt-print') as HTMLButtonElement).disabled).toBe(false);
    type('Spirit 3 clue', 'x'.repeat(300));
    expect(qrImages()).toHaveLength(0);
    expect(screen.queryByTestId('hunt-copy-1')).toBeNull();
    expect((screen.getByTestId('hunt-print') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('hunt-summary').textContent).toMatch(/^Spirit 3: /);
  });

  it('names a Hide_At that is over the limit and blocks printing', () => {
    open();
    fillOffice();
    type('Spirit 1 hide at', 'h'.repeat(41));
    expect(screen.getByTestId('hunt-summary').textContent).toBe(
      'Spirit 1: Hide at is 41/40 characters',
    );
    expect((screen.getByTestId('hunt-print') as HTMLButtonElement).disabled).toBe(true);
    expect(qrImages()).toHaveLength(0);
  });

  it('confirms a copied link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    fillOffice();
    fireEvent.click(screen.getByTestId('hunt-copy-2'));
    expect((await screen.findByTestId('hunt-copied-2')).textContent).toBe(MSG_COPIED);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain('spirit=2');
  });

  it('shows the link and a message when copying fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    fillOffice();
    fireEvent.click(screen.getByTestId('hunt-copy-1'));
    expect(await screen.findByText(MSG_COPY_FAILED)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('hunt-link-1').textContent).toContain('spirit=1'));
    expect(screen.queryByTestId('hunt-copied-1')).toBeNull();
  });

  it('shows a message when window.print throws', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {
      throw new Error('blocked');
    });
    open();
    fillOffice();
    fireEvent.click(screen.getByTestId('hunt-print'));
    expect(screen.getByTestId('hunt-print-error').textContent).toBe(MSG_PRINT_FAILED);
  });

  it('calls window.print when links are ready', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    open();
    fillOffice();
    fireEvent.click(screen.getByTestId('hunt-print'));
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('hunt-print-error')).toBeNull();
  });

  it('makes no fetch call', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    open();
    fillOffice();
    fireEvent.click(screen.getByTestId('hunt-regenerate'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
