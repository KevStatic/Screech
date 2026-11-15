import type { Payload, WifiSecurity } from '@screech/core';
import { buildContactText, sanitizeField } from './contact';

export type TypeKey = 'text' | 'url' | 'wifi' | 'contact';

export interface Draft {
  readonly selected: TypeKey;
  readonly text: string;
  readonly url: string;
  readonly wifi: {
    readonly ssid: string;
    readonly password: string;
    readonly security: WifiSecurity;
  };
  readonly contact: {
    readonly name: string;
    readonly phone: string;
    readonly email: string;
  };
}

export const INITIAL_DRAFT: Draft = {
  selected: 'text',
  text: '',
  url: '',
  wifi: { ssid: '', password: '', security: 'wpa' },
  contact: { name: '', phone: '', email: '' },
};

const filled = (value: string): boolean => value.trim() !== '';

/** True when the selected type has something to send. Other types are ignored. */
export function hasContent(draft: Draft): boolean {
  switch (draft.selected) {
    case 'text':
      return filled(draft.text);
    case 'url':
      return filled(draft.url);
    case 'wifi':
      return filled(draft.wifi.ssid);
    case 'contact':
      return (
        filled(draft.contact.name) || filled(draft.contact.phone) || filled(draft.contact.email)
      );
  }
}

export type BuildResult =
  | { readonly ok: true; readonly payload: Payload }
  | {
      readonly ok: false;
      readonly reason: 'empty' | 'name-required';
      readonly message: string;
    };

const EMPTY_MESSAGE = 'The box has nothing to send. Write something first.';
const NAME_REQUIRED_MESSAGE = 'A contact needs a name. Add one to send it.';

export function buildPayload(draft: Draft): BuildResult {
  if (!hasContent(draft)) return { ok: false, reason: 'empty', message: EMPTY_MESSAGE };

  switch (draft.selected) {
    case 'text':
      return { ok: true, payload: { type: 'text', text: draft.text } };
    case 'url':
      return { ok: true, payload: { type: 'url', url: draft.url.trim() } };
    case 'wifi': {
      const { ssid, password, security } = draft.wifi;
      return {
        ok: true,
        payload: {
          type: 'wifi',
          ssid,
          password: security === 'open' ? '' : password,
          security,
        },
      };
    }
    case 'contact': {
      const { name, phone, email } = draft.contact;
      if (!filled(name)) {
        return { ok: false, reason: 'name-required', message: NAME_REQUIRED_MESSAGE };
      }
      const text = buildContactText({
        name: sanitizeField(name),
        phone: sanitizeField(phone),
        email: sanitizeField(email),
      });
      return { ok: true, payload: { type: 'contact', text } };
    }
  }
}
