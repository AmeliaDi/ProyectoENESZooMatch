/**
 * Chat PIN use cases (docs/CHAT.md, ADR-029): create, unlock, change, status,
 * activity and the open-chat check every future chat route must pass.
 * The PIN is never logged, stored in clear or returned.
 */
import {
  assessPin,
  isResetOnly,
  isRecoveryReady,
  pauseSecondsLeft,
  recoveryReadyAt,
  clearAttempts,
} from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppFailure } from "../errors";
import type { ChatPinRecord, ChatSecurityEvent } from "../ports";
import { ATTEMPT_POLICY, PIN_RULES, RECOVERY_WAIT_HOURS, failure, type ChatPinDeps } from "./deps";
import { recentFailures, verifyPin } from "./verify";

export interface NewPinInput {
  pin: string;
  confirm: string;
}

/** Strength first (the UI asks again from step one), then the confirmation. */
export function checkNewPin(input: NewPinInput): AppFailure | null {
  const assessment = assessPin(input.pin, PIN_RULES);
  if (assessment === "format") return failure("request.invalid");
  if (assessment === "weak") return failure("chat.pin_weak");
  return input.pin === input.confirm ? null : failure("chat.pin_mismatch");
}

async function load(userId: string, deps: ChatPinDeps): Promise<Result<ChatPinRecord, AppFailure>> {
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  return found.value ? ok(found.value) : err(failure("chat.pin_missing"));
}

export async function createChatPin(
  userId: string,
  input: NewPinInput,
  deps: ChatPinDeps,
): Promise<Result<void, AppFailure>> {
  const invalid = checkNewPin(input);
  if (invalid) return err(invalid);
  const digest = await deps.hasher.hash(userId, input.pin);
  const now = deps.clock.now();
  const created = await deps.pins.create(userId, digest, now);
  if (!created.ok) return err(failure(created.error));
  if (!created.value) return err(failure("chat.pin_exists"));
  await deps.pins.recordEvent(userId, "created", now);
  return ok(undefined);
}

/** Chats stay closed while a recovery is pending, even with the right PIN. */
export async function unlockChat(
  userId: string,
  pin: string,
  deps: ChatPinDeps,
): Promise<Result<void, AppFailure>> {
  const record = await load(userId, deps);
  if (!record.ok) return record;
  if (record.value.recoveryRequestedAt) return err(failure("chat.recovery_pending"));
  const verified = await verifyPin(userId, pin, deps);
  return verified.ok ? ok(undefined) : verified;
}

export interface ChangePinInput extends NewPinInput {
  current: string;
}

export async function changeChatPin(
  userId: string,
  input: ChangePinInput,
  deps: ChatPinDeps,
): Promise<Result<void, AppFailure>> {
  const invalid = checkNewPin(input);
  if (invalid) return err(invalid);
  const record = await load(userId, deps);
  if (!record.ok) return record;
  if (record.value.recoveryRequestedAt) return err(failure("chat.recovery_pending"));
  const verified = await verifyPin(userId, input.current, deps);
  if (!verified.ok) return verified;
  const digest = await deps.hasher.hash(userId, input.pin);
  const now = deps.clock.now();
  const saved = await deps.pins.update(userId, null, { digest, changedAt: now, attempts: clearAttempts() });
  if (!saved.ok) return err(failure(saved.error));
  await deps.pins.recordEvent(userId, "changed", now);
  return ok(undefined);
}

/** Gate for every chat route: a lock session alone is not enough. */
export async function assertChatOpen(userId: string, deps: Pick<ChatPinDeps, "pins">): Promise<Result<void, AppFailure>> {
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  if (!found.value) return err(failure("chat.pin_missing"));
  if (found.value.recoveryRequestedAt) return err(failure("chat.recovery_pending"));
  if (isResetOnly(found.value.attempts, ATTEMPT_POLICY)) return err(failure("chat.reset_required"));
  return ok(undefined);
}

export interface ChatStatusDto {
  hasPin: boolean;
  unlocked: boolean;
  pausedUntil?: string;
  retryAfter?: number;
  resetOnly: boolean;
  recovery?: { readyAt: string; ready: boolean };
  recentFailures: number;
}

export function toStatusDto(record: ChatPinRecord | null, unlocked: boolean, now: Date): ChatStatusDto {
  if (!record) return { hasPin: false, unlocked: false, resetOnly: false, recentFailures: 0 };
  const retryAfter = pauseSecondsLeft(record.attempts, now);
  const requested = record.recoveryRequestedAt;
  const resetOnly = isResetOnly(record.attempts, ATTEMPT_POLICY);
  return {
    hasPin: true,
    unlocked: unlocked && !requested && !resetOnly,
    resetOnly,
    recentFailures: recentFailures(record, now),
    ...(retryAfter > 0 && record.attempts.lockedUntil
      ? { pausedUntil: record.attempts.lockedUntil.toISOString(), retryAfter }
      : {}),
    ...(requested
      ? {
          recovery: {
            readyAt: recoveryReadyAt(requested, RECOVERY_WAIT_HOURS).toISOString(),
            ready: isRecoveryReady(requested, now, RECOVERY_WAIT_HOURS),
          },
        }
      : {}),
  };
}

export async function getChatStatus(
  userId: string,
  unlocked: boolean,
  deps: ChatPinDeps,
): Promise<Result<ChatStatusDto, AppFailure>> {
  const found = await deps.pins.find(userId);
  if (!found.ok) return err(failure(found.error));
  return ok(toStatusDto(found.value, unlocked, deps.clock.now()));
}

export interface ChatActivityDto {
  events: Array<{ kind: ChatSecurityEvent["kind"]; at: string }>;
  recentFailures: number;
  lastFailedAt: string | null;
}

export async function getChatActivity(
  userId: string,
  limit: number,
  deps: ChatPinDeps,
): Promise<Result<ChatActivityDto, AppFailure>> {
  const [found, events] = await Promise.all([deps.pins.find(userId), deps.pins.listEvents(userId, limit)]);
  if (!found.ok) return err(failure(found.error));
  if (!events.ok) return err(failure(events.error));
  const record = found.value;
  const failures = record ? recentFailures(record, deps.clock.now()) : 0;
  return ok({
    events: events.value.map((event) => ({ kind: event.kind, at: event.at.toISOString() })),
    recentFailures: failures,
    lastFailedAt: failures > 0 && record?.lastFailedAt ? record.lastFailedAt.toISOString() : null,
  });
}
