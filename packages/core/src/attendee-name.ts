import { err, ok } from './result.js';
import type { Result } from './result.js';

export const ATTENDEE_NAME_MAX = 32;
export const TITLE_MAX = 60;

function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

function validateText(input: unknown, field: string, label: string, max: number): Result<string> {
  if (typeof input !== 'string') {
    return err({
      code: 'invalid-payload',
      field,
      message: `The ${label} must be text`,
    });
  }
  const trimmed = input.trim();
  const length = codePointLength(trimmed);
  if (length < 1) {
    return err({
      code: 'invalid-payload',
      field,
      message: `The ${label} is empty`,
    });
  }
  if (length > max) {
    return err({
      code: 'invalid-payload',
      field,
      message: `The ${label} is too long (${length}/${max} characters)`,
    });
  }
  return ok(trimmed);
}

/** Trim, then accept 1 to 32 Unicode code points. Returns the trimmed name. Never throws. */
export function validateAttendeeName(input: unknown): Result<string> {
  return validateText(input, 'name', 'name', ATTENDEE_NAME_MAX);
}

/** Trim, then accept 1 to 60 Unicode code points. Returns the trimmed title. Never throws. */
export function validateTitle(input: unknown): Result<string> {
  return validateText(input, 'title', 'title', TITLE_MAX);
}
