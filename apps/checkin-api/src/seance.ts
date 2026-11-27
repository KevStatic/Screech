import type { CheckIn } from '@screech/core';

/** A séance as kept in the Seance_Store. */
export interface StoredSeance {
  readonly sessionId: string;
  readonly title: string;
  /** 43 base64url characters. Never leaves the server except in the create response. */
  readonly hostSecret: string;
  /** UTC ISO 8601. */
  readonly createdAt: string;
  readonly ended: boolean;
}

/** One check-in, stored under its own key (session + device). */
export type StoredCheckIn = CheckIn;

/** A séance lives for 24 hours from creation (requirements 5.7, 17.6). */
export const SEANCE_TTL_MS = 24 * 60 * 60 * 1000;

export const SEANCE_STORE_NAME = 'seance-sessions';
export const CHECKIN_STORE_NAME = 'seance-checkins';

export function seanceKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function checkInKey(sessionId: string, deviceId: string): string {
  return `checkin:${sessionId}:${deviceId}`;
}

/** Prefix shared by every check-in key of one séance. */
export function checkInPrefix(sessionId: string): string {
  return `checkin:${sessionId}:`;
}

/** Inverse of `seanceKey`, or null when the key is not a séance key. */
export function sessionIdFromKey(key: string): string | null {
  return key.startsWith('session:') ? key.slice('session:'.length) : null;
}

/**
 * True once 24 hours have passed since `createdAt`. The clock is injected
 * (epoch ms) so tests control it. An unparseable `createdAt` counts as expired.
 */
export function isExpired(seance: Pick<StoredSeance, 'createdAt'>, nowMs: number): boolean {
  const created = Date.parse(seance.createdAt);
  if (Number.isNaN(created)) return true;
  return nowMs - created >= SEANCE_TTL_MS;
}
