/**
 * The response contract of the chat surface (ADR-040): one JSON envelope for
 * every route under `/api/chat` and `/api/interest`. The names match the
 * shared helpers on purpose, so a chat route declares which contract it
 * speaks through its import and nothing else.
 */
export { chatErrorResponse as errorResponse, chatJsonResponse as jsonResponse } from "./responses";