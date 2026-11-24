import { encode } from './codec.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';
import { encodeUtf8Strict } from './utf8.js';

/** 31 unambiguous characters: no 0, O, 1, I, L. */
export const HUNT_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const HUNT_ID_LENGTH = 6;
export const SPIRIT_TOTAL_MIN = 3;
export const SPIRIT_TOTAL_MAX = 7;
export const SPIRIT_NAME_MAX_BYTES = 24;
export const CLUE_SEPARATOR = '\u001f';

export interface ClueFields {
  readonly huntId: string;
  readonly index: number;
  readonly total: number;
  readonly name: string;
  readonly clue: string;
}

/** Accepts anything, so invalid input reaches validation instead of the type checker. */
export type ClueFieldsInput = { readonly [K in keyof ClueFields]: unknown };

const HEADER_LENGTH = HUNT_ID_LENGTH + 2;

/** Control characters (0..31, 127) become one space each, then trim. Non-strings give ''. */
export function sanitizeClueText(value: string): string {
  if (typeof value !== 'string') return '';
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    out += c < 32 || c === 127 ? ' ' : value[i];
  }
  return out.trim();
}

function invalid(field: string, message: string): Result<never> {
  return err({ code: 'invalid-payload', field, message });
}

function isHuntId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== HUNT_ID_LENGTH) return false;
  for (const ch of value) if (!HUNT_ALPHABET.includes(ch)) return false;
  return true;
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Field rules only, no size check. Returns the normalised fields (sanitised name and clue).
 * Checks in the order huntId, total, index, name, clue and returns the first failure.
 */
export function validateClueFields(input: ClueFieldsInput): Result<ClueFields> {
  try {
    if (typeof input !== 'object' || input === null) {
      return invalid('huntId', 'Hunt ID must be 6 characters from the Hunt alphabet');
    }
    const { huntId, total, index, name, clue } = input;
    if (!isHuntId(huntId)) {
      return invalid('huntId', 'Hunt ID must be 6 characters from the Hunt alphabet');
    }
    if (!isIntInRange(total, SPIRIT_TOTAL_MIN, SPIRIT_TOTAL_MAX)) {
      return invalid('total', `Spirit total must be a whole number from ${SPIRIT_TOTAL_MIN} to ${SPIRIT_TOTAL_MAX}`);
    }
    if (!isIntInRange(index, 1, total)) {
      return invalid('index', `Spirit number must be a whole number from 1 to ${total}`);
    }
    if (typeof name !== 'string') return invalid('name', 'Spirit name must be text');
    const cleanName = sanitizeClueText(name);
    if (cleanName.length === 0) return invalid('name', 'Spirit name is empty');
    const nameBytes = encodeUtf8Strict(cleanName);
    if (nameBytes === null) return invalid('name', 'Spirit name has a broken character');
    if (nameBytes.length > SPIRIT_NAME_MAX_BYTES) {
      return invalid('name', `Spirit name is ${nameBytes.length}/${SPIRIT_NAME_MAX_BYTES} bytes`);
    }
    if (typeof clue !== 'string') return invalid('clue', 'Clue must be text');
    const cleanClue = sanitizeClueText(clue);
    if (cleanClue.length === 0) return invalid('clue', 'Clue is empty');
    if (encodeUtf8Strict(cleanClue) === null) return invalid('clue', 'Clue has a broken character');
    return ok({ huntId, index, total, name: cleanName, clue: cleanClue });
  } catch {
    return invalid('huntId', 'clue fields could not be read');
  }
}

/** The text part only: HUNT_ID INDEX TOTAL NAME US CLUE. Fields are used as given. */
export function buildClueText(fields: ClueFields): string {
  return `${fields.huntId}${fields.index}${fields.total}${fields.name}${CLUE_SEPARATOR}${fields.clue}`;
}

/** validateClueFields, then the layout, then Core encode(). Size is checked last by encode(). */
export function buildClue(input: ClueFieldsInput): Result<Uint8Array> {
  const checked = validateClueFields(input);
  if (!checked.ok) return checked;
  return encode({ type: 'hunt-clue', text: buildClueText(checked.value) });
}

function invalidBody(message: string): Result<never> {
  return err({ code: 'invalid-body', message });
}

/** Strict inverse of buildClueText. Anything else gives `invalid-body`. */
export function parseClueText(text: unknown): Result<ClueFields> {
  if (typeof text !== 'string' || text.length === 0) {
    return invalidBody('hunt clue text is missing');
  }
  if (text.length <= HEADER_LENGTH) return invalidBody('hunt clue text is too short');
  const indexChar = text[HUNT_ID_LENGTH] as string;
  const totalChar = text[HUNT_ID_LENGTH + 1] as string;
  if (!/^[0-9]$/.test(indexChar) || !/^[0-9]$/.test(totalChar)) {
    return invalidBody('hunt clue header is malformed');
  }
  const rest = text.slice(HEADER_LENGTH);
  const sep = rest.indexOf(CLUE_SEPARATOR);
  if (sep < 0 || rest.indexOf(CLUE_SEPARATOR, sep + 1) >= 0) {
    return invalidBody('hunt clue must have exactly one separator');
  }
  const candidate = {
    huntId: text.slice(0, HUNT_ID_LENGTH),
    index: Number(indexChar),
    total: Number(totalChar),
    name: rest.slice(0, sep),
    clue: rest.slice(sep + 1),
  };
  const checked = validateClueFields(candidate);
  if (!checked.ok) return invalidBody('hunt clue has an invalid field');
  if (checked.value.name !== candidate.name || checked.value.clue !== candidate.clue) {
    return invalidBody('hunt clue text is not in canonical form');
  }
  return checked;
}
