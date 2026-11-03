import { CHAT_CONFIG } from "@/config";
import type { Clock } from "@/domain/shared";

import type { AppError, AppFailure } from "../errors";
import type { ChatPinRepository, MatriculaVerifier, PinHasher } from "../ports";

export interface ChatPinDeps {
  pins: ChatPinRepository;
  hasher: PinHasher;
  clock: Clock;
}

export interface ChatRecoveryDeps extends ChatPinDeps {
  matricula: MatriculaVerifier;
}

export const PIN_RULES = CHAT_CONFIG.pin;
export const ATTEMPT_POLICY = CHAT_CONFIG.attempts;
export const LOCK_POLICY = CHAT_CONFIG.lock;
export const RECOVERY_WAIT_HOURS = CHAT_CONFIG.recovery.waitHours;

export function failure(code: AppError, hints: Omit<AppFailure, "code"> = {}): AppFailure {
  return { code, ...hints };
}
