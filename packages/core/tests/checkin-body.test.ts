import { describe, expect, it } from 'vitest';
import { decode } from '../src/codec.js';
import {
  buildCheckin,
  buildCheckinText,
  parseCheckinText,
  validateCheckinFields,
} from '../src/checkin-body.js';
import type { CheckinFieldsInput } from '../src/checkin-body.js';

const good = { sessionId: 'ABCD2345', code: '012345' };
const goodText = 'S1:ABCD2345:012345';

function invalidField(input: CheckinFieldsInput): string {
  const r = validateCheckinFields(input);
  if (r.ok) throw new Error('expected failure');
  if (r.error.code !== 'invalid-payload') throw new Error(`unexpected code ${r.error.code}`);
  return r.error.field;
}

function parseMessage(text: unknown): string {
  const r = parseCheckinText(text);
  if (r.ok) throw new Error('expected failure');
  if (r.error.code !== 'invalid-body') throw new Error(`unexpected code ${r.error.code}`);
  return r.error.message;
}

describe('buildCheckinText', () => {
  it('writes the exact S1:<id>:<code> text and keeps leading zeros', () => {
    expect(buildCheckinText(good)).toBe(goodText);
    expect(buildCheckinText(good)).toHaveLength(18);
  });
});

describe('buildCheckin', () => {
  it('encodes a checkin packet whose text is the canonical text', () => {
    const built = buildCheckin(good);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const decoded = decode(built.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    if (decoded.value.multipart) throw new Error('unexpected multipart packet');
    expect(decoded.value.payload).toEqual({ type: 'checkin', text: goodText });
  });

  it('returns an error and no packet for bad fields', () => {
    expect(buildCheckin({ sessionId: 'short', code: '012345' }).ok).toBe(false);
  });
});

describe('validateCheckinFields', () => {
  it('accepts good fields', () => {
    expect(validateCheckinFields(good)).toEqual({ ok: true, value: good });
  });

  it('checks sessionId before code', () => {
    expect(invalidField({ sessionId: 'bad', code: 'bad' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'ABCD2345', code: 'bad' })).toBe('code');
  });

  it.each([null, undefined, 12345678, {}, []])('rejects non-string sessionId %j', (v) => {
    expect(invalidField({ sessionId: v, code: '012345' })).toBe('sessionId');
  });

  it.each([null, undefined, 123456, {}, []])('rejects non-string code %j', (v) => {
    expect(invalidField({ sessionId: 'ABCD2345', code: v })).toBe('code');
  });

  it('rejects wrong length, wrong alphabet and non-digit values', () => {
    expect(invalidField({ sessionId: '', code: '012345' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'ABCD234', code: '012345' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'ABCD23456', code: '012345' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'ABCD2340', code: '012345' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'abcd2345', code: '012345' })).toBe('sessionId');
    expect(invalidField({ sessionId: 'ABCD2345', code: '' })).toBe('code');
    expect(invalidField({ sessionId: 'ABCD2345', code: '12345' })).toBe('code');
    expect(invalidField({ sessionId: 'ABCD2345', code: '1234567' })).toBe('code');
    expect(invalidField({ sessionId: 'ABCD2345', code: '12345a' })).toBe('code');
    expect(invalidField({ sessionId: 'ABCD2345', code: '12345\n' })).toBe('code');
  });

  it('does not throw when the whole input is null or undefined', () => {
    expect(validateCheckinFields(null as unknown as CheckinFieldsInput).ok).toBe(false);
    expect(validateCheckinFields(undefined as unknown as CheckinFieldsInput).ok).toBe(false);
  });
});

describe('parseCheckinText', () => {
  it('parses the canonical text', () => {
    expect(parseCheckinText(goodText)).toEqual({ ok: true, value: good });
  });

  it.each([null, undefined, 42, {}, []])('rejects non-string input %j', (v) => {
    expect(parseMessage(v)).toBe('check-in text is missing');
  });

  it('rejects a trailing newline', () => {
    expect(parseMessage(`${goodText}\n`)).toBe('check-in text has extra characters');
  });

  it('rejects a trailing :', () => {
    expect(parseMessage(`${goodText}:`)).toBe('check-in text has extra characters');
  });

  it('rejects leading whitespace and a lowercase prefix', () => {
    expect(parseMessage(` ${goodText}`)).toMatch(/must start with S1:/);
    expect(parseMessage('s1:ABCD2345:012345')).toMatch(/must start with S1:/);
  });

  it('reports errors in order: prefix, session ID, separator, code, extra', () => {
    expect(parseMessage('X1:bad:bad:bad extra')).toMatch(/must start with/);
    expect(parseMessage('S1:bad:bad extra')).toBe('check-in session ID is malformed');
    expect(parseMessage('S1:ABCD2345-012345 extra')).toBe(
      'check-in text is missing the : separator',
    );
    expect(parseMessage('S1:ABCD2345:bad extra')).toBe('check-in code is malformed');
    expect(parseMessage('S1:ABCD2345:012345 extra')).toBe('check-in text has extra characters');
  });

  it('rejects empty and truncated text without throwing', () => {
    expect(parseMessage('')).toMatch(/must start with S1:/);
    expect(parseMessage('S1:')).toBe('check-in session ID is malformed');
    expect(parseMessage('S1:ABCD2345')).toBe('check-in text is missing the : separator');
    expect(parseMessage('S1:ABCD2345:')).toBe('check-in code is malformed');
    expect(parseMessage('S1:ABCD2345:01234')).toBe('check-in code is malformed');
  });

  it('round-trips with buildCheckinText', () => {
    expect(parseCheckinText(buildCheckinText(good))).toEqual({ ok: true, value: good });
  });
});
