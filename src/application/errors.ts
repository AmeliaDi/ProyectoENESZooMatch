/**
 * Expected failures of the application layer. Routes map each code to an
 * HTTP status and an es-MX message in one place
 * (`infrastructure/http/responses.ts`).
 */
export type AppError =
  | "request.invalid"
  | "auth.unauthorized"
  | "auth.forbidden"
  | "auth.locked"
  | "service.unavailable"
  | "service.misconfigured"
  | "quiz.not_completed"
  | "storage.failed"
  | "match.pool_unstable"
  | ChatError;

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
  | "chat.recovery_invalid";

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
