import { useCallback, useEffect, useRef, useState } from 'react';
import { ATTENDEE_NAME_MAX, validateAttendeeName } from '@screech/core';
import type { CheckinFields } from '@screech/core';
import {
  MSG_ENDED,
  MSG_NOT_FOUND,
  MSG_PUBLIC_NO_SIGNAL,
  fetchPublic,
  joinErrorMessage,
  postCheckin,
} from '../../logic/checkin-client';
import type { ApiOutcome, FetchLike } from '../../logic/checkin-client';
import { getOrCreateDeviceId, loadLastName, saveLastName } from '../../logic/seance-storage';
import type { StorageLike } from '../../logic/seance-storage';

/** 14.2 */
export const NAME_LENGTH_HINT = 'The name must be 1 to 32 characters.';
/** 13.3 and 13.8 */
export const REACHING_TEXT = 'Reaching the séance...';
/** 14.7 */
export const JOINING_TEXT = 'Joining...';

/** What the Join_Screen shows for the public request. */
export type PublicPhase = 'loading' | 'open' | 'ended' | 'not-found' | 'no-signal';

export type JoinPhase = 'idle' | 'pending' | 'lit';

/** Everything the hook touches outside React. Replace any of it in tests. */
export interface JoinDeps {
  readonly fetch: FetchLike;
  /** localStorage, or null when unavailable. */
  readonly local: StorageLike | null;
  readonly randomBytes: (n: number) => Uint8Array;
}

/** Called by the hook's actions. The app wires these to screen changes. */
export interface JoinCallbacks {
  /** Leave button (14.12): back to Listen, no request. */
  readonly onLeave: () => void;
  /** "Listen again" (16.2): back to Listen and start capture. The typed name is passed along. */
  readonly onListenAgain: (name: string) => void;
}

export interface JoinView {
  readonly sessionId: string;
  /** The newest decoded code. */
  readonly code: string;
  readonly publicPhase: PublicPhase;
  /** Null until the public request succeeds (or the server gave one). */
  readonly title: string | null;
  /** Message for the public request or for a terminal check-in answer. Null when there is none. */
  readonly notice: string | null;

  readonly name: string;
  readonly setName: (name: string) => void;
  /** 32 minus the trimmed code point count; negative when too long (14.2). */
  readonly remaining: number;
  readonly nameValid: boolean;
  /** Plain-words name message, shown while the name is not valid (14.3). */
  readonly nameMessage: string | null;

  readonly joinPhase: JoinPhase;
  /** Button text: "Joining..." while pending, otherwise "Join". */
  readonly joinLabel: string;
  /** Join button is shown at all (public open, not ended or not found). */
  readonly showJoin: boolean;
  /** Join button is shown and enabled. */
  readonly joinEnabled: boolean;
  /** Plain-words check-in error, null when none (16.9: never a status code). */
  readonly error: string | null;
  /** Retry button for a failed check-in (14.8). */
  readonly showRetry: boolean;
  /** "Listen again" button after an expired code (16.1). */
  readonly showListenAgain: boolean;

  /** Success state (15). Null until the check-in succeeds. */
  readonly lit: { readonly name: string; readonly title: string; readonly alreadyCheckedIn: boolean } | null;

  /**
   * Feed a newly decoded Checkin_Packet. The same Session_ID only replaces the
   * code (13.10). A different Session_ID, or a packet on the Lit_Screen, is ignored (13.12).
   */
  readonly receive: (fields: CheckinFields) => void;
  /** Join button and the check-in Retry button: one request per call. */
  readonly join: () => void;
  /** Retry for the public request (13.8). */
  readonly retryPublic: () => void;
  readonly listenAgain: () => void;
  readonly leave: () => void;
}

function defaultDeps(): JoinDeps {
  let local: StorageLike | null = null;
  try {
    local = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    local = null;
  }
  return {
    fetch: (input, init) => fetch(input, init),
    local,
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
}

function codePointCount(text: string): number {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}

type JoinError = { readonly message: string; readonly terminal: boolean; readonly expired: boolean };

function errorFor(outcome: ApiOutcome<unknown>): JoinError {
  const message = joinErrorMessage(outcome);
  const status = outcome.kind === 'http-error' ? outcome.status : 0;
  return {
    message,
    terminal: status === 410 || status === 404,
    expired: status === 403,
  };
}

export function useJoin(
  initial: CheckinFields,
  callbacks: JoinCallbacks,
  injected?: Partial<JoinDeps>,
): JoinView {
  const depsRef = useRef<JoinDeps | null>(null);
  if (depsRef.current === null) depsRef.current = { ...defaultDeps(), ...injected };
  const deps = depsRef.current;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [sessionId] = useState(initial.sessionId);
  const [code, setCode] = useState(initial.code);
  const codeRef = useRef(initial.code);

  const [publicPhase, setPublicPhase] = useState<PublicPhase>('loading');
  const [title, setTitle] = useState<string | null>(null);

  const [name, setNameState] = useState<string>(() => loadLastName(deps.local) ?? '');
  const nameRef = useRef(name);

  const [joinPhase, setJoinPhase] = useState<JoinPhase>('idle');
  const [joinError, setJoinError] = useState<JoinError | null>(null);
  const [lit, setLit] = useState<JoinView['lit']>(null);

  // One request per tap: the ref blocks a second call before React re-renders.
  const joiningRef = useRef(false);
  const litRef = useRef(false);
  const publicRunRef = useRef(0);
  const publicStartedRef = useRef(false);
  const titleRef = useRef<string | null>(null);

  const loadPublic = useCallback((): void => {
    publicRunRef.current += 1;
    const run = publicRunRef.current;
    setPublicPhase('loading');
    void fetchPublic(deps.fetch, sessionId).then(({ outcome }) => {
      if (run !== publicRunRef.current) return;
      if (outcome.kind === 'ok') {
        titleRef.current = outcome.value.title;
        setTitle(outcome.value.title);
        setPublicPhase(outcome.value.open ? 'open' : 'ended');
      } else if (outcome.kind === 'http-error' && outcome.status === 404) {
        setPublicPhase('not-found');
      } else {
        setPublicPhase('no-signal');
      }
    });
  }, [deps, sessionId]);

  // The public request goes out once when the screen opens (13.2).
  useEffect(() => {
    if (publicStartedRef.current) return;
    publicStartedRef.current = true;
    loadPublic();
  }, [loadPublic]);

  const receive = useCallback(
    (fields: CheckinFields): void => {
      if (litRef.current) return;
      if (fields.sessionId !== sessionId) return;
      codeRef.current = fields.code;
      setCode(fields.code);
    },
    [sessionId],
  );

  const setName = useCallback((next: string): void => {
    nameRef.current = next;
    setNameState(next);
  }, []);

  const join = useCallback((): void => {
    if (joiningRef.current || litRef.current) return;
    const checked = validateAttendeeName(nameRef.current);
    if (!checked.ok) return;
    joiningRef.current = true;
    setJoinError(null);
    setJoinPhase('pending');
    // Read the id when needed, so a blocked storage still gives a usable id.
    const deviceId = getOrCreateDeviceId(deps.local, deps.randomBytes);
    void postCheckin(deps.fetch, sessionId, {
      code: codeRef.current,
      name: checked.value,
      deviceId,
    }).then(({ outcome }) => {
      joiningRef.current = false;
      if (outcome.kind === 'ok') {
        saveLastName(deps.local, outcome.value.name);
        litRef.current = true;
        setLit({
          name: outcome.value.name,
          title: titleRef.current ?? '',
          alreadyCheckedIn: outcome.value.alreadyCheckedIn,
        });
        setJoinPhase('lit');
        return;
      }
      setJoinError(errorFor(outcome));
      setJoinPhase('idle');
    });
  }, [deps, sessionId]);

  const listenAgain = useCallback((): void => {
    callbacksRef.current.onListenAgain(nameRef.current);
  }, []);

  const leave = useCallback((): void => {
    callbacksRef.current.onLeave();
  }, []);

  // Late responses after the screen closes must not touch state.
  useEffect(
    () => () => {
      publicRunRef.current += 1;
      // Lets the start effect refetch if React re-mounts (StrictMode in development only).
      publicStartedRef.current = false;
    },
    [],
  );

  const trimmedCount = codePointCount(name.trim());
  const nameValid = validateAttendeeName(name).ok;
  const terminalError = joinError !== null && joinError.terminal;
  const pending = joinPhase === 'pending';

  let publicNotice: string | null = null;
  if (publicPhase === 'ended') publicNotice = MSG_ENDED;
  else if (publicPhase === 'not-found') publicNotice = MSG_NOT_FOUND;
  else if (publicPhase === 'no-signal') publicNotice = MSG_PUBLIC_NO_SIGNAL;
  const notice = terminalError ? joinError.message : publicNotice;

  const showJoin = publicPhase === 'open' && !terminalError && joinPhase !== 'lit';
  const error = joinError !== null && !joinError.terminal ? joinError.message : null;

  return {
    sessionId,
    code,
    publicPhase,
    title,
    notice,
    name,
    setName,
    remaining: ATTENDEE_NAME_MAX - trimmedCount,
    nameValid,
    nameMessage: nameValid ? null : NAME_LENGTH_HINT,
    joinPhase,
    joinLabel: pending ? JOINING_TEXT : 'Join',
    showJoin,
    joinEnabled: showJoin && nameValid && !pending,
    error,
    showRetry: joinError !== null && !joinError.terminal && !joinError.expired && joinPhase === 'idle',
    showListenAgain: joinError !== null && joinError.expired,
    lit,
    receive,
    join,
    retryPublic: loadPublic,
    listenAgain,
    leave,
  };
}
