import { cancelPinRecovery, requestPinRecovery } from "@/application/chat";
import { recoveryCancelSchema, recoveryRequestSchema } from "@/application/validation/chat";
import { failureResponse, guardedChat, parseChatBody } from "@/infrastructure/chat/chat-route.server";
import { clearLockCookie } from "@/infrastructure/chat/lock-cookie.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/chat-responses";
import { logServerEvent } from "@/infrastructure/observability/log.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request: `{ matricula }` → `{ readyAt }`. Chats stay closed during the wait.
 * A wrong matrícula gets the generic `chat.recovery_invalid`.
 */
async function handlePost(request: Request) {
  const body = await parseChatBody(request, recoveryRequestSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const requested = await requestPinRecovery(resolved.value.userId, body.matricula, resolved.value.deps);
  if (!requested.ok) return failureResponse(requested.error);
  logServerEvent("info", "chat.recovery_requested");
  const response = jsonResponse(requested.value);
  clearLockCookie(response);
  return response;
}

/** Cancel: `{ pin }` (the current one) → `{ ok: true }`. */
async function handleDelete(request: Request) {
  const body = await parseChatBody(request, recoveryCancelSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const cancelled = await cancelPinRecovery(resolved.value.userId, body.pin, resolved.value.deps);
  if (!cancelled.ok) return failureResponse(cancelled.error);
  logServerEvent("info", "chat.recovery_cancelled");
  return jsonResponse({ ok: true });
}

const methods = ["POST", "DELETE"] as const;
const policy = { name: "chat-recovery", limit: 10, windowSeconds: 60, methods };

export const POST = withChatApiSecurity(handlePost, policy);
export const DELETE = withChatApiSecurity(handleDelete, policy);
export const OPTIONS = createChatPreflightHandler(methods);
