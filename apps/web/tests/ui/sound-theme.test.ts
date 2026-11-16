import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/logic/contrast';

// Validates: Requirements 9.4, 12.9

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

const tokensCss = read('../../src/styles/tokens.css');
const screensCss = read('../../src/styles/screens.css');

const tokens = new Map<string, string>();
for (const m of tokensCss.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  tokens.set(m[1] as string, m[2] as string);
}

function bodyOf(selector: string): string {
  for (const m of screensCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = (m[1] ?? '').split(',').map((s) => s.trim());
    if (sels.includes(selector)) return m[2] ?? '';
  }
  throw new Error(`No rule for ${selector}`);
}

function colour(selector: string, prop: string): string {
  const match = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(
    bodyOf(selector),
  );
  if (!match) throw new Error(`${selector} has no ${prop} token`);
  const hex = tokens.get(match[1] as string);
  if (!hex) throw new Error(`Unknown token ${match[1]}`);
  return hex;
}

// Transparent backgrounds sit on the page surface.
const page = (selector: string): string => {
  const body = bodyOf(selector);
  return /background\s*:\s*transparent/.test(body) ? (tokens.get('--bg') as string) : colour(selector, 'background');
};

const pairs: ReadonlyArray<readonly [string, string]> = [
  ['.sound-toggle', '.sound-toggle'],
  ['.sound-toggle.is-off', '.sound-toggle'],
  ['.sound-hint', '.sound-hint'],
  ['.sound-hint-dismiss', '.sound-hint'],
  ['.sound-notice.is-error', '.sound-notice'],
];

describe('sound theme contrast', () => {
  it.each(pairs)('%s text reaches 4.5:1', (textSel, surfaceSel) => {
    const fg = colour(textSel, 'color');
    // Toggles and dismiss sit on their own background or on the parent surface.
    const bg = surfaceSel === textSel ? page(textSel) : page(surfaceSel);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses red only for the failure notice', () => {
    const red = new Set([tokens.get('--blood'), tokens.get('--blood-2'), tokens.get('--salmon')]);
    for (const sel of ['.sound-toggle', '.sound-toggle.is-off', '.sound-hint', '.sound-hint-dismiss']) {
      expect(red.has(colour(sel, 'color'))).toBe(false);
    }
  });

  it('has no motion, gradients or short touch targets', () => {
    for (const sel of ['.toggle-cluster', '.sound-toggle', '.sound-toggle.is-off', '.sound-hint', '.sound-hint-dismiss', '.sound-notice']) {
      const body = bodyOf(sel);
      expect(body).not.toMatch(/animation|transition|gradient/);
    }
    expect(bodyOf('.toggle-cluster')).toMatch(/display\s*:\s*flex/);
  });
});
