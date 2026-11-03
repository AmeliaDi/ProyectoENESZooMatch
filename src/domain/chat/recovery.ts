/**
 * "Olvidé mi PIN" (docs/CHAT.md §5): retyping the matrícula starts a waiting
 * period; only after it ends can a new PIN be set.
 */
import { MS_PER_HOUR, secondsUntil } from "./time";

export function recoveryReadyAt(requestedAt: Date, waitHours: number): Date {
  return new Date(requestedAt.getTime() + waitHours * MS_PER_HOUR);
}

export function recoverySecondsLeft(requestedAt: Date, now: Date, waitHours: number): number {
  return secondsUntil(recoveryReadyAt(requestedAt, waitHours), now);
}

export function isRecoveryReady(requestedAt: Date, now: Date, waitHours: number): boolean {
  return recoverySecondsLeft(requestedAt, now, waitHours) === 0;
}
