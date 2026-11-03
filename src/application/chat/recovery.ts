/**
 * "Olvidé mi PIN" (docs/CHAT.md §5): the matrícula is retyped, a waiting
 * period starts (cancellable with the current PIN) and only then a new PIN
 * can be set. It only rewrites the PIN: nothing else is touched (there are no
 * messages yet, and when there are, a reset must never delete them).
 */
import { clearAttempts, isRecoveryReady, recoveryReadyAt, recoverySecondsLeft } from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppFailure } from "../errors";
import { RECOVERY_WAIT_HOURS, failure, type ChatPinDeps, type ChatRecoveryDeps } from "./deps";
import { checkNewPin, type NewPinInput } from "./pin";
import { verifyPin } from "./verify";

export interface RecoveryDto {
  readyAt: string;
}

/** Idempotent: a second request keeps the original start of the wait. */
export async function requestPinRecovery(
  userId: string,
  matricula: string,
  deps: ChatRecoveryDeps,
): Promise<Result<RecoveryDto, AppFailure>> {
  const matches = await deps.matricula.matches(userId, matricula);
  if (!matches.ok) return err(failure(matches.error));
  if (!matches.value) return err(failure("chat.recovery_invalid"));
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  if (!found.value) return err(failure("chat.pin_missing"));
  const pending = found.value.recoveryRequestedAt;
  if (pending) return ok({ readyAt: recoveryReadyAt(pending, RECOVERY_WAIT_HOURS).toISOString() });

  const now = deps.clock.now();
  const saved = await deps.pins.update(userId, found.value.revision, { recoveryRequestedAt: now });
  if (!saved.ok) return err(failure(saved.error));
  if (!saved.value) return err(failure("service.unavailable"));
  await deps.pins.recordEvent(userId, "recovery_requested", now);
  return ok({ readyAt: recoveryReadyAt(now, RECOVERY_WAIT_HOURS).toISOString() });
}

/** Knowing the current PIN proves the request was not wanted. */
export async function cancelPinRecovery(
  userId: string,
  pin: string,
  deps: ChatPinDeps,
): Promise<Result<void, AppFailure>> {
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  if (!found.value) return err(failure("chat.pin_missing"));
  if (!found.value.recoveryRequestedAt) return err(failure("chat.recovery_none"));
  const verified = await verifyPin(userId, pin, deps, { allowResetOnly: true });
  if (!verified.ok) return verified;
  const saved = await deps.pins.update(userId, null, { recoveryRequestedAt: null });
  if (!saved.ok) return err(failure(saved.error));
  await deps.pins.recordEvent(userId, "recovery_cancelled", deps.clock.now());
  return ok(undefined);
}

export async function completePinRecovery(
  userId: string,
  input: NewPinInput,
  deps: ChatPinDeps,
): Promise<Result<void, AppFailure>> {
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  if (!found.value) return err(failure("chat.pin_missing"));
  const requested = found.value.recoveryRequestedAt;
  if (!requested) return err(failure("chat.recovery_none"));
  const now = deps.clock.now();
  if (!isRecoveryReady(requested, now, RECOVERY_WAIT_HOURS)) {
    return err(failure("chat.recovery_not_ready", { retryAfter: recoverySecondsLeft(requested, now, RECOVERY_WAIT_HOURS) }));
  }
  const invalid = checkNewPin(input);
  if (invalid) return err(invalid);
  const digest = await deps.hasher.hash(userId, input.pin);
  const saved = await deps.pins.update(userId, found.value.revision, {
    digest,
    changedAt: now,
    attempts: clearAttempts(),
    recoveryRequestedAt: null,
  });
  if (!saved.ok) return err(failure(saved.error));
  if (!saved.value) return err(failure("service.unavailable"));
  await deps.pins.recordEvent(userId, "recovery_completed", now);
  return ok(undefined);
}
