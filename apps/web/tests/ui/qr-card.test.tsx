// Feature: ghost-hunt, task 8.8: SetupQr and QrCard (Requirements 3.21, 6.1, 6.3, 6.5, 6.6, 6.10)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const control = vi.hoisted(() => ({ throwOnCreate: false }));

vi.mock('qrcode', async (importOriginal) => {
  const actual = await importOriginal<{ default: { create: (...a: unknown[]) => unknown } }>();
  return {
    default: {
      ...actual.default,
      create: (...args: unknown[]): unknown => {
        if (control.throwOnCreate) throw new Error('boom');
        return actual.default.create(...args);
      },
    },
  };
});

import SetupQr from '../../src/ui/components/SetupQr';
import QrCard from '../../src/ui/components/QrCard';
import type { QrCardModel } from '../../src/logic/qr-cards';

let width = 400;
const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get');

beforeEach(() => {
  control.throwOnCreate = false;
  width = 400;
  widthSpy.mockImplementation(() => width);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LINK_A = 'https://screech.example/#h=abc&i=1&n=3&c=first';
const LINK_B = 'https://screech.example/#h=abc&i=2&n=3&c=second-clue-is-longer';

const model = (over: Partial<QrCardModel> = {}): QrCardModel => ({
  index: 2,
  total: 3,
  title: 'Spirit 2 of 3',
  name: 'Grim',
  huntId: 'abc123',
  hideAtLine: 'Hide at: the attic',
  link: LINK_A,
  alt: 'Spirit 2 of 3, Grim',
  ...over,
});

describe('SetupQr', () => {
  it('draws an svg with role img and the alt text, using one path', () => {
    const { container } = render(createElement(SetupQr, { link: LINK_A, alt: 'Spirit 2 of 3, Grim' }));
    const svg = screen.getByRole('img', { name: 'Spirit 2 of 3, Grim' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(container.querySelectorAll('svg path')).toHaveLength(1);
  });

  it('redraws when the link changes', () => {
    const { container, rerender } = render(createElement(SetupQr, { link: LINK_A, alt: 'a' }));
    const before = container.querySelector('path')?.getAttribute('d');
    expect(before).toBeTruthy();
    rerender(createElement(SetupQr, { link: LINK_B, alt: 'a' }));
    const after = container.querySelector('path')?.getAttribute('d');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it('shows the link text and a message when qrcode throws', () => {
    control.throwOnCreate = true;
    const { container } = render(createElement(SetupQr, { link: LINK_A, alt: 'a', label: 'Spirit 2' }));
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText(LINK_A)).toBeTruthy();
    expect(screen.getByText(/The QR code for Spirit 2 could not be drawn\./)).toBeTruthy();
  });

  it('shows the link text when the layout does not fit', () => {
    width = 100;
    const { container } = render(createElement(SetupQr, { link: LINK_A, alt: 'a', label: 'Spirit 2' }));
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText(LINK_A)).toBeTruthy();
    expect(screen.getByText(/could not be drawn/)).toBeTruthy();
  });

  it('makes no fetch call', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(SetupQr, { link: LINK_A, alt: 'a' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('QrCard', () => {
  it('shows the QR, title, name and Hunt_ID as plain text', () => {
    render(createElement(QrCard, { model: model() }));
    expect(screen.getByRole('img', { name: 'Spirit 2 of 3, Grim' })).toBeTruthy();
    expect(screen.getByText('Spirit 2 of 3')).toBeTruthy();
    expect(screen.getByText('Grim')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
  });

  it('shows the Hide at line when it is not empty', () => {
    render(createElement(QrCard, { model: model() }));
    expect(screen.getByText('Hide at: the attic')).toBeTruthy();
  });

  it('omits the Hide at line when it is empty', () => {
    const { container } = render(createElement(QrCard, { model: model({ hideAtLine: null }) }));
    expect(container.querySelector('.qr-card-hide')).toBeNull();
    expect(screen.queryByText(/Hide at:/)).toBeNull();
  });

  it('does not parse a name as HTML', () => {
    const { container } = render(createElement(QrCard, { model: model({ name: '<b>Grim</b>' }) }));
    expect(container.querySelector('.qr-card-name b')).toBeNull();
    expect(screen.getByText('<b>Grim</b>')).toBeTruthy();
  });
});
