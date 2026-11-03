/**
 * Lock session: proof that this browser opened the chat lock recently
 * (docs/CHAT.md §3). Times are epoch milliseconds so the payload serializes
 * compactly into the signed cookie.
 */
import { MS_PER_MINUTE, MS_PER_SECOND } from "./time";

export interface LockSession {
  uid: string;
  /** Issued at. */
  iat: number;
  /** Last chat request; renewed on each one (idle window). */
  lastSeen: number;
  /** Hard expiry, `iat + maxMinutes`, never extended. */
  exp: number;
}

export interface LockPolicy {
  idleMinutes: number;
  maxMinutes: number;
}

export type LockCheck = "open" | "other_user" | "idle" | "expired" | "future";

export function openLockSession(uid: string, now: Date, policy: LockPolicy): LockSession {
  const at = now.getTime();
  return { uid, iat: at, lastSeen: at, exp: at + policy.maxMinutes * MS_PER_MINUTE };
}

/** `future` rejects timestamps ahead of the server clock (forged or skewed). */
export function checkLockSession(
  session: LockSession,
  uid: string,
  now: Date,
  policy: LockPolicy,
): LockCheck {
  const at = now.getTime();
  if (session.uid !== uid) return "other_user";
  if (session.iat > at || session.lastSeen > at || session.lastSeen < session.iat) return "future";
  if (at >= session.exp || session.exp - session.iat > policy.maxMinutes * MS_PER_MINUTE) return "expired";
  if (at - session.lastSeen >= policy.idleMinutes * MS_PER_MINUTE) return "idle";
  return "open";
}

export function touchLockSession(session: LockSession, now: Date): LockSession {
  return { ...session, lastSeen: Math.max(session.lastSeen, now.getTime()) };
}

/** Seconds the cookie must live: until the hard expiry, never longer. */
export function lockSessionMaxAge(session: LockSession, now: Date): number {
  return Math.max(0, Math.floor((session.exp - now.getTime()) / MS_PER_SECOND));
}
