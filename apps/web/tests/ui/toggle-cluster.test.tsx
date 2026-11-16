// Feature: haunting-sounds, task 10.3: ToggleCluster (Requirements 6.8, 9.1, 12.1)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import ToggleCluster from '../../src/ui/components/ToggleCluster';

afterEach(() => {
  cleanup();
});

describe('ToggleCluster', () => {
  it('has exactly one Sound toggle, directly before the Exorcise toggle', () => {
    const { container } = render(createElement(ToggleCluster));
    const switches = screen.getAllByRole('switch');
    expect(switches.map((s) => s.textContent?.split(':')[0])).toEqual(['Sound', 'Exorcise']);
    expect(screen.getAllByText(/^Sound:/)).toHaveLength(1);
    const root = container.querySelector('.toggle-cluster');
    expect(root).not.toBeNull();
    expect(root?.children[0]?.contains(switches[0] ?? null) || root?.children[0] === switches[0]).toBe(true);
  });

  it('shows no failure notice before a sound fails', () => {
    const { container } = render(createElement(ToggleCluster));
    expect(container.querySelector('.sound-notice')).toBeNull();
  });
});
