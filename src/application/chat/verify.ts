/**
 * Guess evaluation shared by unlock, change and recovery cancel. Every guess
 * is charged with a compare-and-swap BEFORE the hash is compared, so parallel
 * requests cannot evaluate more guesses than the pause schedule allows.
 */
import {
  MS_PER_DAY,
  attemptsLeft,
  chargeAttempt,
  clearAttempts,
  isResetOnly,
  pauseSecondsLeft,
} from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppFailure } from "../errors";
import type { ChatPinRecord } from "../ports";
import { ATTEMPT_POLICY, failure, type ChatPinDeps } from "./deps";

/** Retries when another request charged the same record first. */
const CHARGE_RETRIES = 3;

export function recentFailures(record: ChatPinRecord, now: Date): number {
  const windowMs = ATTEMPT_POLICY.recentFailureDays * MS_PER_DAY;
  const at = record.lastFailedAt;
  return at && now.getTime() - at.getTime() < windowMs ? record.recentFailures : 0;
}

export interface VerifyOptions {
  /** Cancelling a pending recovery is allowed even in reset-only mode. */
  allowResetOnly?: boolean;
}

/** Fails without charging when the PIN cannot be tried right now. */
export function gate(record: ChatPinRecord, now: Date, options: VerifyOptions): AppFailure | null {
  if (!options.allowResetOnly && isResetOnly(record.attempts, ATTEMPT_POLICY)) {
    return failure("chat.reset_required");
  }
  const retryAfter = pauseSecondsLeft(record.attempts, now);
  return retryAfter > 0 ? failure("chat.pin_paused", { retryAfter }) : null;
}

type Charge = { record: ChatPinRecord; charged: ChatPinRecord; pauses: boolean };

async function charge(
  userId: string,
  deps: ChatPinDeps,
  options: VerifyOptions,
): Promise<Result<Charge, AppFailure>> {
  for (let tries = 0; tries < CHARGE_RETRIES; tries += 1) {
    const found = await deps.pins.find(userId);
    if (!found.ok) return err(failure(found.error));
    const record = found.value;
    if (!record) return err(failure("chat.pin_missing"));
    const now = deps.clock.now();
    const blocked = gate(record, now, options);
    if (blocked) return err(blocked);
    const next = chargeAttempt(record.attempts, now, ATTEMPT_POLICY);
    const charged: ChatPinRecord = {
      ...record,
      attempts: next.state,
      recentFailures: recentFailures(record, now) + 1,
      lastFailedAt: now,
    };
    const { attempts, recentFailures: count, lastFailedAt } = charged;
    const saved = await deps.pins.update(userId, record.revision, { attempts, recentFailures: count, lastFailedAt });
    if (!saved.ok) return err(failure(saved.error));
    if (saved.value) return ok({ record, charged, pauses: next.pauses });
  }
  return err(failure("service.unavailable"));
}

function wrongGuess(charged: ChatPinRecord, now: Date, options: VerifyOptions): AppFailure {
  if (!options.allowResetOnly && isResetOnly(charged.attempts, ATTEMPT_POLICY)) {
    return failure("chat.reset_required");
  }
  const retryAfter = pauseSecondsLeft(charged.attempts, now);
  if (retryAfter > 0) return failure("chat.pin_paused", { retryAfter });
  return failure("chat.pin_invalid", { attemptsLeft: attemptsLeft(charged.attempts, ATTEMPT_POLICY) });
}

/**
 * Verifies `pin`. On success the attempt state is cleared and the charged
 * failure is taken back; on a wrong guess it stays and may start a pause.
 */
export async function verifyPin(
  userId: string,
  pin: string,
  deps: ChatPinDeps,
  options: VerifyOptions = {},
): Promise<Result<ChatPinRecord, AppFailure>> {
  const charged = await charge(userId, deps, options);
  if (!charged.ok) return charged;
  const { record, pauses } = charged.value;
  const matches = await deps.hasher.verify(userId, pin, record.digest);
  const now = deps.clock.now();
  if (!matches) {
    if (pauses) await deps.pins.recordEvent(userId, "paused", now);
    return err(wrongGuess(charged.value.charged, now, options));
  }
  const restored = { attempts: clearAttempts(), recentFailures: record.recentFailures, lastFailedAt: record.lastFailedAt };
  const saved = await deps.pins.update(userId, null, restored);
  if (!saved.ok) return err(failure(saved.error));
  return ok({ ...record, ...restored });
}
