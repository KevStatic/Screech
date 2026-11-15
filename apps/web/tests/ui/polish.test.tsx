import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ByteCandle, { WAX_MAX_PX } from '../../src/ui/components/ByteCandle';
import SwallowedText from '../../src/ui/components/SwallowedText';
import SpeakerGrille from '../../src/ui/components/SpeakerGrille';

afterEach(cleanup);

const ok = (fill: number) => ({ status: 'ok' as const, size: Math.round(fill * 140), fill, message: null });

describe('ByteCandle', () => {
  it('is full when empty and burns down as fill grows', () => {
    render(createElement(ByteCandle, { budget: ok(0) }));
    expect(screen.getByTestId('candle-wax').style.height).toBe(`${WAX_MAX_PX}px`);
    cleanup();
    render(createElement(ByteCandle, { budget: ok(0.5) }));
    expect(screen.getByTestId('candle-wax').style.height).toBe(`${WAX_MAX_PX / 2}px`);
    expect(screen.getByTestId('candle-flame')).toBeTruthy();
  });
  it('has no wax and no flame when too heavy', () => {
    render(
      createElement(ByteCandle, {
        budget: { status: 'too-large', size: 148, fill: 1, message: 'Too heavy to cross over (148/140 bytes)' },
      }),
    );
    expect(screen.getByTestId('candle-wax').style.height).toBe('0px');
    expect(screen.queryByTestId('candle-flame')).toBeNull();
  });
});

describe('SwallowedText', () => {
  it('swallows letters in step with progress', () => {
    render(createElement(SwallowedText, { text: 'abcd', progress: 0.5 }));
    expect(document.querySelectorAll('.is-swallowed').length).toBe(2);
  });
  it('groups each word, with its punctuation, so lines only break at spaces', () => {
    render(createElement(SwallowedText, { text: 'Meet, me at 9!', progress: 0 }));
    const words = [...document.querySelectorAll('[data-testid="swallow-word"]')].map((w) => w.textContent);
    expect(words).toEqual(['Meet,', 'me', 'at', '9!']);
    expect(document.querySelector('.swallow-box')?.textContent).toBe('Meet, me at 9!');
  });
  it('keeps swallowing in step across words', () => {
    render(createElement(SwallowedText, { text: 'ab cd', progress: 0.6 }));
    expect(document.querySelectorAll('.is-swallowed').length).toBe(3);
  });
});

describe('SpeakerGrille', () => {
  it('shows pulse rings only while active', () => {
    const { rerender } = render(createElement(SpeakerGrille, { active: true }));
    expect(document.querySelectorAll('.grille-ring').length).toBe(2);
    rerender(createElement(SpeakerGrille, { active: false }));
    expect(document.querySelectorAll('.grille-ring').length).toBe(0);
  });
});
