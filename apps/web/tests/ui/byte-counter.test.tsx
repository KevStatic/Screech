// Feature: ghost-hunt, task 8.9: ByteCounter and PackConfirm (Requirements 3.10, 4.2-4.5, 4.11, 4.15, 4.16)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import ByteCounter from '../../src/ui/components/ByteCounter';
import PackConfirm, { packConfirmText } from '../../src/ui/components/PackConfirm';
import { longClueNote } from '../../src/logic/airtime';
import type { RowStatus } from '../../src/logic/hunt-setup';

afterEach(cleanup);

const ok = (size: number): RowStatus => ({
  kind: 'ok',
  size,
  label: `${size}/140 bytes · about 3 s`,
  longNote: longClueNote(size),
});

describe('ByteCounter', () => {
  it('shows the OK label in a polite live region with no error tag', () => {
    render(createElement(ByteCounter, { status: ok(60) }));
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('60/140 bytes · about 3 s');
    expect(screen.queryByText('Error:')).toBeNull();
    expect(region.className).not.toContain('is-error');
  });

  it('treats exactly 140 bytes as full, not as an error', () => {
    render(createElement(ByteCounter, { status: ok(140) }));
    const region = screen.getByRole('status');
    expect(region.className).toContain('is-full');
    expect(region.className).not.toContain('is-error');
    expect(screen.queryByText('Error:')).toBeNull();
    expect(region.textContent).toContain('140/140');
  });

  it('shows the error text and an Error: tag at 141 bytes', () => {
    const status: RowStatus = {
      kind: 'too-large',
      length: 141,
      label: 'Too heavy to cross over (141/140 bytes)',
    };
    render(createElement(ByteCounter, { status }));
    const region = screen.getByRole('status');
    expect(region.className).toContain('is-error');
    expect(screen.getByText('Error:')).toBeTruthy();
    expect(region.textContent).toContain('Too heavy to cross over (141/140 bytes)');
  });

  it('shows the Long_Clue_Note above 100 bytes', () => {
    render(createElement(ByteCounter, { status: ok(101) }));
    const note = longClueNote(101);
    expect(note).not.toBeNull();
    expect(screen.getByText(note as string)).toBeTruthy();
  });

  it('shows no note at exactly 100 bytes', () => {
    const { container } = render(createElement(ByteCounter, { status: ok(100) }));
    expect(container.querySelector('.long-clue-note')).toBeNull();
  });

  it('shows the message for an invalid field with an Error: tag', () => {
    const status: RowStatus = { kind: 'invalid', field: 'name', label: 'The name has a forbidden character' };
    render(createElement(ByteCounter, { status }));
    expect(screen.getByText('Error:')).toBeTruthy();
    expect(screen.getByText('The name has a forbidden character')).toBeTruthy();
  });
});

describe('PackConfirm', () => {
  it('calls onConfirm and not onCancel when Replace is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(createElement(PackConfirm, { count: 2, onConfirm, onCancel }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace with pack' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel and not onConfirm when Keep is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(createElement(PackConfirm, { count: 2, onConfirm, onCancel }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep my text' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('names the number of fields in the question', () => {
    const noop = (): void => undefined;
    render(createElement(PackConfirm, { count: 3, onConfirm: noop, onCancel: noop }));
    expect(screen.getByText(packConfirmText(3))).toBeTruthy();
    expect(packConfirmText(3)).toContain('3 fields');
    expect(packConfirmText(1)).toContain('1 field ');
  });
});
