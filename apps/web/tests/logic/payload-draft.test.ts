import { describe, it, expect } from 'vitest';
import { buildContactText } from '../../src/logic/contact';
import { INITIAL_DRAFT, buildPayload, hasContent } from '../../src/logic/payload-draft';
import type { Draft } from '../../src/logic/payload-draft';

const draft = (patch: Partial<Draft>): Draft => ({ ...INITIAL_DRAFT, ...patch });

describe('INITIAL_DRAFT', () => {
  it('starts on text with every field empty and WPA selected', () => {
    expect(INITIAL_DRAFT).toEqual({
      selected: 'text',
      text: '',
      url: '',
      wifi: { ssid: '', password: '', security: 'wpa' },
      contact: { name: '', phone: '', email: '' },
    });
  });
});

describe('hasContent', () => {
  it('is false for the initial draft', () => {
    expect(hasContent(INITIAL_DRAFT)).toBe(false);
  });

  it('text and url ignore whitespace-only input', () => {
    expect(hasContent(draft({ selected: 'text', text: '   ' }))).toBe(false);
    expect(hasContent(draft({ selected: 'text', text: ' hi ' }))).toBe(true);
    expect(hasContent(draft({ selected: 'url', url: ' \t' }))).toBe(false);
    expect(hasContent(draft({ selected: 'url', url: 'https://a.b' }))).toBe(true);
  });

  it('wifi depends on the SSID only', () => {
    const wifi = { ssid: ' ', password: 'secret', security: 'wpa' as const };
    expect(hasContent(draft({ selected: 'wifi', wifi }))).toBe(false);
    expect(hasContent(draft({ selected: 'wifi', wifi: { ...wifi, ssid: 'Net' } }))).toBe(true);
  });

  it('contact is true when any field is filled', () => {
    const c = { name: '', phone: '', email: '' };
    expect(hasContent(draft({ selected: 'contact', contact: c }))).toBe(false);
    expect(hasContent(draft({ selected: 'contact', contact: { ...c, name: 'Ada' } }))).toBe(true);
    expect(hasContent(draft({ selected: 'contact', contact: { ...c, phone: '1' } }))).toBe(true);
    expect(hasContent(draft({ selected: 'contact', contact: { ...c, email: 'a@b.c' } }))).toBe(true);
  });

  it('ignores content of unselected types', () => {
    expect(hasContent(draft({ selected: 'url', text: 'typed elsewhere' }))).toBe(false);
  });
});

describe('buildPayload', () => {
  it('returns empty for an empty draft', () => {
    const r = buildPayload(INITIAL_DRAFT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('text is sent as typed', () => {
    expect(buildPayload(draft({ selected: 'text', text: '  hello  ' }))).toEqual({
      ok: true,
      payload: { type: 'text', text: '  hello  ' },
    });
  });

  it('url is trimmed', () => {
    expect(buildPayload(draft({ selected: 'url', url: '  https://a.b/c  ' }))).toEqual({
      ok: true,
      payload: { type: 'url', url: 'https://a.b/c' },
    });
  });

  it('open wifi sends an empty password', () => {
    const wifi = { ssid: 'Cafe', password: 'leftover', security: 'open' as const };
    expect(buildPayload(draft({ selected: 'wifi', wifi }))).toEqual({
      ok: true,
      payload: { type: 'wifi', ssid: 'Cafe', password: '', security: 'open' },
    });
  });

  it('wpa keeps the password', () => {
    const wifi = { ssid: 'Home', password: 'hunter2', security: 'wpa' as const };
    expect(buildPayload(draft({ selected: 'wifi', wifi }))).toEqual({
      ok: true,
      payload: { type: 'wifi', ssid: 'Home', password: 'hunter2', security: 'wpa' },
    });
  });

  it('contact is built through buildContactText', () => {
    const contact = { name: 'Ada', phone: '555', email: 'ada@x.io' };
    expect(buildPayload(draft({ selected: 'contact', contact }))).toEqual({
      ok: true,
      payload: { type: 'contact', text: buildContactText(contact) },
    });
  });

  it('blank contact name gives name-required and leaves phone and email in the draft', () => {
    const d = draft({
      selected: 'contact',
      contact: { name: '   ', phone: '555', email: 'ada@x.io' },
    });
    const r = buildPayload(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('name-required');
    expect(d.contact).toEqual({ name: '   ', phone: '555', email: 'ada@x.io' });
  });
});
