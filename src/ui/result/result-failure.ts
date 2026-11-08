/**
 * Why `GET /api/result` failed, as far as the viewer needs to know. An egg is
 * not a connection problem: telling them to retry would loop forever, so the
 * missing quiz gets its own state with a way back to the questionnaire.
 */
export type ResultFailure = "generic" | "session" | "quiz";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function classifyResultFailure(status: number, body: unknown): ResultFailure {
  if (status === 401) return "session";
  if (status === 404 && isRecord(body) && body.code === "quiz.not_completed") return "quiz";
  return "generic";
}
