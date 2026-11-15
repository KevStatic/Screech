import { SIZE_CAP } from '@screech/core';
import type { CodecError, Result } from '@screech/core';

export type BudgetStatus = 'ok' | 'too-large' | 'invalid';

export interface Budget {
  /** 'ok' fits, 'too-large' is over the cap, 'invalid' could not be encoded at all. */
  readonly status: BudgetStatus;
  /** Packet size, the length Core reported for too-large, or null for invalid. */
  readonly size: number | null;
  /** 0..1 */
  readonly fill: number;
  /** Plain-words error, null when ok. */
  readonly message: string | null;
}

function tooHeavy(length: number): string {
  return `Too heavy to cross over (${length}/${SIZE_CAP} bytes)`;
}

/** Plain-words description of an encode error. */
export function describeEncodeError(error: CodecError): string {
  if (error.code === 'too-large') return tooHeavy(error.length);
  if (error.code === 'invalid-payload') {
    switch (error.field) {
      case 'url':
        return 'Portals must start with http:// or https://.';
      case 'ssid':
        return 'Network names must be 1 to 32 bytes.';
      case 'password':
        return 'WPA and WEP passwords must be 1 to 63 bytes.';
      case 'security':
        return 'Choose open, WPA or WEP.';
      default:
        return "This message holds a character the box can't carry. Try removing pasted symbols.";
    }
  }
  if (error.code === 'invalid-wifi') return "Open networks don't use a password.";
  return "The box couldn't prepare this message.";
}

/** Maps an encode result to a byte budget. Pure and total. */
export function budget(result: Result<Uint8Array>): Budget {
  if (result.ok) {
    const length = result.value.length;
    if (length > SIZE_CAP) {
      return { status: 'too-large', size: length, fill: 1, message: tooHeavy(length) };
    }
    return { status: 'ok', size: length, fill: Math.min(1, length / SIZE_CAP), message: null };
  }
  const { error } = result;
  if (error.code === 'too-large') {
    return { status: 'too-large', size: error.length, fill: 1, message: describeEncodeError(error) };
  }
  return { status: 'invalid', size: null, fill: 0, message: describeEncodeError(error) };
}
