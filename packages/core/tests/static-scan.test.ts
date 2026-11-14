import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = join(__dirname, '..', 'src');

/** Removes // and block comments while leaving string and template literals intact. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          out += source[i] as string;
          i++;
        }
        if (i < source.length) out += source[i] as string;
        i++;
      }
      if (i < source.length) out += quote;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

const files = readdirSync(SRC_DIR)
  .filter((name) => name.endsWith('.ts'))
  .sort()
  .map((name) => ({ name, code: stripComments(readFileSync(join(SRC_DIR, name), 'utf8')) }));

const ANY_TYPE = /:\s*any\b|\bas\s+any\b|<\s*any\s*[>,[]|,\s*any\s*>|\bany\s*\[\]|\|\s*any\b|\bany\s*\|/;

describe('static scan of packages/core/src', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(['node:', 'require(', 'Buffer', 'process.'])(
    'no source file contains %s',
    (needle) => {
      const offenders = files.filter((f) => f.code.includes(needle)).map((f) => f.name);
      expect(offenders).toEqual([]);
    },
  );

  it('getRandomValues appears only in sender-state.ts', () => {
    const offenders = files
      .filter((f) => f.code.includes('getRandomValues'))
      .map((f) => f.name)
      .filter((name) => name !== 'sender-state.ts');
    expect(offenders).toEqual([]);
  });

  it('crypto.subtle appears only in seal.ts', () => {
    const offenders = files
      .filter((f) => /crypto\s*\.\s*subtle/.test(f.code))
      .map((f) => f.name)
      .filter((name) => name !== 'seal.ts');
    expect(offenders).toEqual([]);
  });

  it('no source file uses any as a type annotation', () => {
    const offenders = files.filter((f) => ANY_TYPE.test(f.code)).map((f) => f.name);
    expect(offenders).toEqual([]);
  });
});
