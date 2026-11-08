/**
 * Structured server logging. Callers must pass only non-identifying fields:
 * never a matrícula, its hash, an email, a user id or raw answers.
 */
export type LogField = string | number | boolean | null;

export function logServerEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, LogField> = {},
): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Reduces a library error to fields that are safe to log. */
export function safeErrorFields(error: unknown): Record<string, LogField> {
  if (!error || typeof error !== "object") return { errorKind: typeof error };
  const record = error as Record<string, unknown>;
  const pick = (key: string): LogField => {
    const value = record[key];
    return typeof value === "string" || typeof value === "number" ? value : null;
  };
  return { errorCode: pick("code"), errorStatus: pick("status"), errorName: pick("name") };
}