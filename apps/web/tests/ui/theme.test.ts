import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/logic/contrast';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokensCss = stripComments(read('../../src/styles/tokens.css'));
const screensCss = stripComments(read('../../src/styles/screens.css'));
const motionCss = stripComments(read('../../src/styles/motion.css'));
const readme = read('../../../../docs/design/README.md');

interface Rule {
  selectors: string[];
  body: string;
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    const prelude = (m[1] ?? '').trim();
    if (prelude.startsWith('@')) continue;
    rules.push({
      selectors: prelude.split(',').map((s) => s.trim()).filter(Boolean),
      body: m[2] ?? '',
    });
  }
  return rules;
}

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    tokens.set(m[1] as string, (m[2] as string).toLowerCase());
  }
  return tokens;
}

const tokens = parseTokens(tokensCss);
const tok = (name: string): string => {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`Missing token ${name}`);
  return v;
};

const RED_TOKENS = ['--blood', '--blood-2', '--salmon'];
const RED_HEX = ['#ff3b3b', '#ff5a5a', '#ff8a7a'];

describe('theme: token table (Requirement 2.1)', () => {
  it('matches the hex values in docs/design/README.md', () => {
    const expected: Record<string, string> = {
      '--bg': '#050806',
      '--panel': '#07110a',
      '--panel-2': '#08130b',
      '--border': '#2f5a3a',
      '--border-dim': '#1f3a27',
      '--phosphor': '#39ff7a',
      '--green-2': '#5aa86c',
      '--bone': '#e9e4d4',
      '--blood': '#ff3b3b',
      '--blood-2': '#ff5a5a',
      '--salmon': '#ff8a7a',
    };
    const readmeHex = new Set((readme.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase()));
    for (const [name, hex] of Object.entries(expected)) {
      expect(tok(name), name).toBe(hex);
      expect(readmeHex.has(hex), `${hex} listed in README`).toBe(true);
    }
    // Every hex in the token table appears in the README, and nothing else is defined.
    expect([...tokens.keys()].sort()).toEqual(Object.keys(expected).sort());
  });
});

describe('theme: contrast (Requirement 2.6)', () => {
  const textColours = ['--phosphor', '--green-2', '--bone', '--blood', '--blood-2', '--salmon'];
  const surfaces = ['--bg', '--panel', '--panel-2'];

  it.each(textColours.flatMap((t) => surfaces.map((s) => [t, s] as const)))(
    '%s on %s is at least 4.5:1',
    (fg, bg) => {
      expect(contrastRatio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('primary button text (--bg) on phosphor is at least 4.5:1', () => {
    expect(contrastRatio(tok('--bg'), tok('--phosphor'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every colour used for text in screens.css is covered by the pairs above', () => {
    const used = new Set<string>();
    for (const rule of parseRules(screensCss)) {
      const m = /(?:^|[;\s])color\s*:\s*var\((--[a-z0-9-]+)\)/.exec(rule.body);
      if (m) used.add(m[1] as string);
    }
    const covered = new Set([...textColours, '--bg']);
    for (const name of used) expect(covered.has(name), name).toBe(true);
  });
});

describe('theme: red is reserved (Requirement 2.2)', () => {
  const allowed = /\.(is-error|is-curse|is-seal)\b/;

  it('red tokens and hex values are used only by error, curse and seal selectors', () => {
    for (const rule of parseRules(screensCss)) {
      const usesRed =
        RED_TOKENS.some((t) => rule.body.includes(`var(${t})`)) ||
        RED_HEX.some((h) => rule.body.toLowerCase().includes(h));
      if (!usesRed) continue;
      for (const sel of rule.selectors) {
        expect(allowed.test(sel), `selector "${sel}" uses a red colour`).toBe(true);
      }
    }
  });

  it('red hex values are defined only in tokens.css', () => {
    for (const css of [screensCss, motionCss]) {
      for (const h of RED_HEX) expect(css.toLowerCase()).not.toContain(h);
    }
  });

  it('is-error, is-curse and is-seal actually use red', () => {
    const rules = parseRules(screensCss);
    for (const cls of ['.is-error', '.is-curse', '.is-seal']) {
      const rule = rules.find((r) => r.selectors.includes(cls));
      expect(rule, cls).toBeDefined();
      expect(RED_TOKENS.some((t) => rule?.body.includes(`var(${t})`))).toBe(true);
    }
  });
});

describe('theme: touch targets (Requirement 2.5)', () => {
  it('--hit is 44px and .hit applies it to both axes', () => {
    expect(/--hit\s*:\s*44px/.test(tokensCss)).toBe(true);
    const hit = parseRules(screensCss).find((r) => r.selectors.includes('.hit'));
    expect(hit?.body).toMatch(/min-width\s*:\s*var\(--hit\)/);
    expect(hit?.body).toMatch(/min-height\s*:\s*var\(--hit\)/);
  });

  it.each(['.btn', '.field'])('control class %s is at least 44px tall', (cls) => {
    const rules = parseRules(screensCss).filter((r) => r.selectors.includes(cls));
    const ok = rules.some((r) => /min-height\s*:\s*(var\(--hit\)|44px)/.test(r.body));
    expect(ok, `${cls} needs min-height: var(--hit)`).toBe(true);
  });

  it('.btn is also at least 44px wide', () => {
    const rules = parseRules(screensCss).filter((r) => r.selectors.includes('.btn'));
    expect(rules.some((r) => /min-width\s*:\s*(var\(--hit\)|44px)/.test(r.body))).toBe(true);
  });
});

// ---- Ghost Hunt (Requirements 4.11, 6.14, 6.15, 13.12, 14.13, 15.1, 15.4, 15.5, 15.8) ----

const huntCssRaw = read('../../src/styles/hunt.css');
const huntCss = stripComments(huntCssRaw);
const printStart = huntCss.indexOf('@media print');
const huntScreenCss = printStart >= 0 ? huntCss.slice(0, printStart) : huntCss;
const huntPrintCss = printStart >= 0 ? huntCss.slice(printStart) : '';

const HUNT_SOURCES = [
  'ui/screens/HuntSetup.tsx',
  'ui/screens/HuntReveal.tsx',
  'ui/screens/HuntComplete.tsx',
  'ui/screens/Beacon.tsx',
  'ui/screens/BeaconError.tsx',
  'ui/components/AlreadyNote.tsx',
  'ui/components/ByteCounter.tsx',
  'ui/components/PackConfirm.tsx',
  'ui/components/QrCard.tsx',
  'ui/components/SetupQr.tsx',
  'ui/components/SpiritCounter.tsx',
].map((p) => ({ path: p, text: read(`../../src/${p}`) }));

describe('theme: Ghost Hunt controls (Requirements 4.11, 15.4)', () => {
  it.each(HUNT_SOURCES.map((s) => [s.path, s.text] as const))(
    '%s: every <button> uses .hit',
    (_path, text) => {
      const tags = text.match(/<button\b(?:=>|[^>])*>/g) ?? [];
      for (const tag of tags) expect(/className=(?:"[^"]*|\{`[^`]*)\bhit\b/.test(tag), tag).toBe(true);
    },
  );

  it.each(HUNT_SOURCES.map((s) => [s.path, s.text] as const))(
    '%s: every input, select and textarea uses .field',
    (_path, text) => {
      const tags = text.match(/<(?:input|select|textarea)\b(?:=>|[^>])*>/g) ?? [];
      for (const tag of tags) expect(/className="[^"]*\bfield\b/.test(tag), tag).toBe(true);
    },
  );

  it('hunt.css gives controls inside .hunt-controls a 44px minimum', () => {
    const rule = parseRules(huntScreenCss).find((r) => r.selectors.includes('.hunt-controls button'));
    expect(rule?.body).toMatch(/min-width\s*:\s*var\(--hit\)/);
    expect(rule?.body).toMatch(/min-height\s*:\s*var\(--hit\)/);
  });
});

describe('theme: Ghost Hunt contrast (Requirement 15.5)', () => {
  const surfaces = ['--bg', '--panel', '--panel-2'];

  const resolve = (value: string): string | null => {
    const v = /var\((--[a-z0-9-]+)\)/.exec(value);
    if (v) return tok(v[1] as string);
    const hex = /^#[0-9a-fA-F]{6}$/.exec(value.trim());
    return hex ? value.trim().toLowerCase() : null;
  };
  const prop = (body: string, name: string): string | null => {
    const m = new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+)`).exec(body);
    return m ? (m[1] as string).trim() : null;
  };

  it('every text colour in hunt.css reaches 4.5:1 on the background it sits on', () => {
    let checked = 0;
    for (const rule of parseRules(huntScreenCss)) {
      const fgRaw = prop(rule.body, 'color');
      const fg = fgRaw === null ? null : resolve(fgRaw);
      if (fg === null) continue;
      const bgRaw = prop(rule.body, 'background') ?? prop(rule.body, 'background-color');
      const bg = bgRaw === null ? null : resolve(bgRaw);
      const backgrounds = bg !== null ? [bg] : surfaces.map(tok);
      for (const b of backgrounds) {
        expect(contrastRatio(fg, b), `${rule.selectors.join(', ')}: ${fg} on ${b}`).toBeGreaterThanOrEqual(4.5);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it.each([
    ['.already-note', '--bone', '--panel'],
    ['.byte-counter', '--green-2', '--bg'],
    ['.byte-counter.is-full', '--bone', '--bg'],
    ['.long-clue-note', '--bone', '--bg'],
    ['.byte-counter.is-error', '--blood-2', '--bg'],
  ] as const)('%s: %s on %s', (selector, fg, bg) => {
    const rule = parseRules(huntScreenCss).find((r) => r.selectors.includes(selector));
    expect(rule, selector).toBeDefined();
    if (selector !== '.byte-counter') expect(rule?.body).toContain(`var(${fg})`);
    expect(contrastRatio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('QR card text (#000) on the bone card is at least 4.5:1', () => {
    const rule = parseRules(huntScreenCss).find((r) => r.selectors.includes('.qr-card'));
    expect(rule?.body).toMatch(/background\s*:\s*var\(--bone\)/);
    expect(rule?.body).toMatch(/color\s*:\s*#000\b/);
    expect(contrastRatio('#000000', tok('--bone'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme: Ghost Hunt red is reserved (Requirement 15.1)', () => {
  const allowed = /(\.is-error|\.is-curse|\.is-seal|-error\b)/;

  it('red is used only by error selectors in hunt.css', () => {
    for (const rule of parseRules(huntScreenCss)) {
      const usesRed =
        RED_TOKENS.some((t) => rule.body.includes(`var(${t})`)) ||
        RED_HEX.some((h) => rule.body.toLowerCase().includes(h));
      if (!usesRed) continue;
      for (const sel of rule.selectors) {
        expect(allowed.test(sel), `selector "${sel}" uses a red colour`).toBe(true);
      }
    }
  });

  it('hunt.css defines no red hex value', () => {
    for (const h of RED_HEX) expect(huntCss.toLowerCase()).not.toContain(h);
  });
});

describe('theme: Ghost Hunt has no emoji and no gradients (Requirement 15.8)', () => {
  const files = [
    { path: 'styles/hunt.css', text: huntCssRaw },
    ...HUNT_SOURCES,
  ];

  it.each(files.map((f) => [f.path, f.text] as const))('%s has no emoji', (_p, text) => {
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });

  it.each(files.map((f) => [f.path, f.text] as const))('%s has no gradient', (_p, text) => {
    expect(/gradient/i.test(text)).toBe(false);
  });
});

describe('theme: Ghost Hunt print block (Requirements 6.14, 6.15, 13.12, 14.13)', () => {
  const rules = parseRules(huntPrintCss);
  const find = (sel: string): Rule | undefined => rules.find((r) => r.selectors.includes(sel));

  it('has a print block', () => {
    expect(printStart).toBeGreaterThanOrEqual(0);
  });

  it('keeps each .qr-card on one page', () => {
    expect(find('.qr-card')?.body).toMatch(/break-inside\s*:\s*avoid/);
    expect(find('.qr-card')?.body).toMatch(/page-break-inside\s*:\s*avoid/);
  });

  it('uses a white page with black text', () => {
    const page = find('html');
    expect(page?.body).toMatch(/background\s*:\s*#fff/);
    expect(page?.body).toMatch(/color\s*:\s*#000/);
    expect(find('.qr-card')?.body).toMatch(/background\s*:\s*#fff/);
    expect(find('.qr-card')?.body).toMatch(/color\s*:\s*#000/);
    expect(find('.qr-card svg path')?.body).toMatch(/fill\s*:\s*#000/);
  });

  it('hides every control, input and message', () => {
    const hidden = parseRules(huntPrintCss).find(
      (r) => r.selectors.includes('button') && /display\s*:\s*none/.test(r.body),
    );
    expect(hidden).toBeDefined();
    for (const sel of ['input', 'textarea', 'select', '.btn', '.hit', '.field', '.byte-counter', '.hunt-message', '.no-print']) {
      expect(hidden?.selectors, sel).toContain(sel);
    }
  });
});
