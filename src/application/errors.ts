/**
 * Expected failures of the application layer. Routes map each code to an
 * HTTP status and an es-MX message in one place
 * (`infrastructure/http/responses.ts`).
 */
export type AppError =
  | "request.invalid"
  | "auth.unauthorized"
  | "auth.forbidden"
  | "auth.invalid_credentials"
  | "auth.locked"
  | "service.unavailable"
  | "service.misconfigured"
  | "quiz.not_completed"
  | "storage.failed"
  | "match.pool_unstable";

/** Failure of a persistence adapter; adapters never throw. */
export type StorageError = "storage.failed";
