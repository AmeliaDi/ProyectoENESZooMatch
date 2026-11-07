/**
 * Expected failures of the application layer. Routes map each code to an
 * HTTP status and an es-MX message in one place
 * (`infrastructure/http/responses.ts`).
 */
export type AppError =
  | "request.invalid"
  | "request.rate_limited"
  | "request.unknown_route"
  | "auth.unauthorized"
  | "auth.forbidden"
  | "auth.locked"
  | "service.unavailable"
  | "service.misconfigured"
  | "service.internal"
  | "quiz.not_completed"
  | "storage.failed"
  | "match.pool_unstable"
  | AdminError
  | ChatError;

/** Admin console (ADR-036). A failed login never says which part was wrong. */
export type AdminError =
  | "admin.invalid"
  | "admin.paused"
  | "admin.not_found"
  | "admin.protected";

/** Chat PIN lock (docs/CHAT.md). Messages never hint at the PIN itself. */
export type ChatError =
  | "chat.locked"
  | "chat.pin_missing"
  | "chat.pin_exists"
  | "chat.pin_invalid"
  | "chat.pin_weak"
  | "chat.pin_mismatch"
  | "chat.pin_paused"
  | "chat.reset_required"
  | "chat.recovery_pending"
  | "chat.recovery_none"
  | "chat.recovery_not_ready"
  | "chat.recovery_invalid"
  | "chat.not_found"
  | "chat.match_gone"
  | "chat.conflict"
  | "chat.not_allowed"
  | "chat.adult_required"
  | "chat.cooldown"
  | "chat.too_many_signals"
  | "chat.link_blocked"
  | "chat.offensive"
  | "chat.slow_down"
  | "chat.repeated";

/** A failure plus the optional hints a client may show (never PIN details). */
export interface AppFailure {
  code: AppError;
  /** Seconds until the action may be retried. */
  retryAfter?: number;
  /** Guesses left before the next pause. */
  attemptsLeft?: number;
}

/** Failure of a persistence adapter; adapters never throw. */
export type StorageError = "storage.failed";
