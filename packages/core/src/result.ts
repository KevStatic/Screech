export type CodecErrorCode =
  | 'bad-magic'
  | 'unsupported-version'
  | 'truncated'
  | 'unknown-type'
  | 'reserved-flags'
  | 'too-large'
  | 'invalid-payload'
  | 'invalid-wifi'
  | 'invalid-body'
  | 'auth-failed'
  | 'key-required'
  | 'invalid-key'
  | 'invalid-counter'
  | 'invalid-sender-id'
  | 'not-sealed'
  | 'crypto-unavailable';

export type CodecError =
  | { readonly code: 'too-large'; readonly length: number; readonly message: string }
  | { readonly code: 'invalid-payload'; readonly field: string; readonly message: string }
  | {
      readonly code: Exclude<CodecErrorCode, 'too-large' | 'invalid-payload'>;
      readonly message: string;
    };

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err = { readonly ok: false; readonly error: CodecError };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: CodecError): Err {
  return { ok: false, error };
}
