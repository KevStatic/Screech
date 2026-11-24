// Feature: ghost-hunt, task 8.10: SpiritCounter (Requirements 10.8, 10.9, 10.15, 10.18, 10.19)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import SpiritCounter from '../../src/ui/components/SpiritCounter';
import type { FoundState } from '../../src/logic/hunt-found';

function state(total: number, found: Array<[number, string]>): FoundState {
  return {
    huntId: 'h1',
    total,
    found: found.map(([index, name]) => ({ index, name })),
    firstFoundAt: null,
    completedAt: null,
  };
}

afterEach(() => {
  cleanup();
});

describe('SpiritCounter', () => {
  it('shows exactly total entries, with "unknown" for unfound Spirits', () => {
    const { container } = render(
      createElement(SpiritCounter, { state: state(4, [[2, 'Mabel']]) }),
    );
    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(4);
    expect(Array.from(rows).map((r) => r.textContent)).toEqual([
      'unknown',
      'Mabel',
      'unknown',
      'unknown',
    ]);
    expect(screen.getByText('Spirits found: 1 of 4')).toBeTruthy();
  });

  it('shows all unknown when nothing is found', () => {
    const { container } = render(createElement(SpiritCounter, { state: state(3, []) }));
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getAllByText('unknown')).toHaveLength(3);
  });

  it('exposes one text value on the root and hides marks from assistive tech', () => {
    const { container } = render(
      createElement(SpiritCounter, { state: state(2, [[1, 'Ada']]) }),
    );
    const root = screen.getByTestId('spirit-counter');
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-label')).toBe(
      'Spirits found: 1 of 2. Spirit 1 of 2: Ada. Spirit 2 of 2: unknown.',
    );
    for (const mark of container.querySelectorAll('.spirit-mark')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('keeps a long name whole in the DOM and the name style allows wrapping', () => {
    const long = 'Bartholomew'.repeat(12);
    render(createElement(SpiritCounter, { state: state(1, [[1, long]]) }));
    expect(screen.getByText(long).className).toBe('spirit-name');
    const css = readFileSync(resolve(process.cwd(), 'src/styles/hunt.css'), 'utf8');
    const block = /\.spirit-name\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('overflow-wrap: anywhere');
  });

  it('renders markup in a name as text, not elements', () => {
    const name = '<b>Bold</b>';
    const { container } = render(createElement(SpiritCounter, { state: state(1, [[1, name]]) }));
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('.spirit-name')?.textContent).toBe(name);
  });
});
