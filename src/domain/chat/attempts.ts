/**
 * Growing pauses after failed PIN attempts (docs/CHAT.md §4). Pure state
 * transitions with the clock injected as `now`.
 *
 * Each evaluated guess is charged BEFORE the hash is compared (see
 * `chargeAttempt`), so parallel requests cannot evaluate more guesses than the
 * schedule allows; a correct guess then clears everything (`clearAttempts`).
 */
import { MS_PER_MINUTE, secondsUntil } from "./time";

export interface AttemptPolicy {
  perStep: number;
  waitMinutes: readonly number[];
  resetOnlyAfterMaxPauses: number;
}

export interface AttemptState {
  /** Failures since the last pause (or since the last success). */
  failedAttempts: number;
  /** Pauses already served; indexes `waitMinutes` (the last value repeats). */
  pauseStep: number;
  /** Pauses served at the longest wait. */
  longPauses: number;
  lockedUntil: Date | null;
}

export const CLEAR_ATTEMPTS: AttemptState = Object.freeze({
  failedAttempts: 0,
  pauseStep: 0,
  longPauses: 0,
  lockedUntil: null,
});

export function clearAttempts(): AttemptState {
  return { ...CLEAR_ATTEMPTS };
}

/** Minutes of the pause that follows the `step`-th block of failures. */
export function waitMinutesFor(step: number, policy: AttemptPolicy): number {
  const last = policy.waitMinutes.length - 1;
  return policy.waitMinutes[Math.min(Math.max(step, 0), last)] ?? 0;
}

/** After enough pauses at the longest wait, only a reset unlocks the PIN. */
export function isResetOnly(state: AttemptState, policy: AttemptPolicy): boolean {
  return state.longPauses >= policy.resetOnlyAfterMaxPauses;
}

export function pauseSecondsLeft(state: AttemptState, now: Date): number {
  return secondsUntil(state.lockedUntil, now);
}

export function attemptsLeft(state: AttemptState, policy: AttemptPolicy): number {
  return Math.max(0, policy.perStep - state.failedAttempts);
}

export interface ChargedAttempt {
  state: AttemptState;
  /** This guess, if wrong, starts a pause. */
  pauses: boolean;
}

/** Counts one guess as failed; completing a block starts the next pause. */
export function chargeAttempt(state: AttemptState, now: Date, policy: AttemptPolicy): ChargedAttempt {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < policy.perStep) {
    return { state: { ...state, failedAttempts }, pauses: false };
  }
  const minutes = waitMinutesFor(state.pauseStep, policy);
  const isLongest = state.pauseStep >= policy.waitMinutes.length - 1;
  return {
    pauses: true,
    state: {
      failedAttempts: 0,
      pauseStep: state.pauseStep + 1,
      longPauses: state.longPauses + (isLongest ? 1 : 0),
      lockedUntil: new Date(now.getTime() + minutes * MS_PER_MINUTE),
    },
  };
}
