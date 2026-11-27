import { encode } from './codec.js';
import { HUNT_ALPHABET } from './hunt-clue.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';

export const CHECKIN_PREFIX = 'S1';
export const SESSION_ID_LENGTH = 8;
export const ROLLING_CODE_LENGTH = 6;

export interface CheckinFields {
  /** Exactly 8 characters from the Hunt alphabet. */
  readonly sessionId: string;
  /** Exactly 6 digits, '0'..'9'. Leading zeros are kept. */
  readonly code: string;
}

/** Accepts anything, so invalid input reaches validation instead of the type checker. */
export type CheckinFieldsInput = { readonly [K in keyof CheckinFields]: unknown };

const PREFIX_TEXT = `${CHECKIN_PREFIX}:`;
const ID_START = PREFIX_TEXT.length;
const ID_END = ID_START + SESSION_ID_LENGTH;
const CODE_START = ID_END + 1;
const CODE_END = CODE_START + ROLLING_CODE_LENGTH;

function invalid(field: string, message: string): Result<never> {
  return err({ code: 'invalid-payload', field, message });
}

function invalidBody(message: string): Result<never> {
  return err({ code: 'invalid-body', message });
}

function isSessionId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== SESSION_ID_LENGTH) return false;
  for (const ch of value) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

function isRollingCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value);
}

/** Field rules only. Checks sessionId, then code, and returns the first failure. */
export function validateCheckinFields(input: CheckinFieldsInput): Result<CheckinFields> {
  try {
    if (typeof input !== 'object' || input === null) {
      return invalid('sessionId', 'Session ID must be 8 characters from the Hunt alphabet');
    }
    const { sessionId, code } = input;
    if (!isSessionId(sessionId)) {
      return invalid('sessionId', 'Session ID must be 8 characters from the Hunt alphabet');
    }
    if (!isRollingCode(code)) {
      return invalid('code', 'Code must be exactly 6 digits');
    }
    return ok({ sessionId, code });
  } catch {
    return invalid('sessionId', 'check-in fields could not be read');
  }
}

/** The text part only: S1:SESSION_ID:CODE. Fields are used as given. */
export function buildCheckinText(fields: CheckinFields): string {
  return `${PREFIX_TEXT}${fields.sessionId}:${fields.code}`;
}

/** validateCheckinFields, then the layout, then Core encode(). */
export function buildCheckin(input: CheckinFieldsInput): Result<Uint8Array> {
  const checked = validateCheckinFields(input);
  if (!checked.ok) return checked;
  return encode({ type: 'checkin', text: buildCheckinText(checked.value) });
}

/**
 * Strict inverse of buildCheckinText. Checks prefix, session ID, code, then extra
 * characters, and rejects anything that is not the canonical text.
 */
export function parseCheckinText(text: unknown): Result<CheckinFields> {
  try {
    if (typeof text !== 'string') return invalidBody('check-in text is missing');
    if (!text.startsWith(PREFIX_TEXT)) {
      return invalidBody(`check-in text must start with ${PREFIX_TEXT}`);
    }
    const sessionId = text.slice(ID_START, ID_END);
    if (!isSessionId(sessionId)) return invalidBody('check-in session ID is malformed');
    if (text[ID_END] !== ':') return invalidBody('check-in text is missing the : separator');
    const code = text.slice(CODE_START, CODE_END);
    if (!isRollingCode(code)) return invalidBody('check-in code is malformed');
    if (text.length > CODE_END) return invalidBody('check-in text has extra characters');
    const fields: CheckinFields = { sessionId, code };
    if (buildCheckinText(fields) !== text) {
      return invalidBody('check-in text is not in canonical form');
    }
    return ok(fields);
  } catch {
    return invalidBody('check-in text could not be read');
  }
}
