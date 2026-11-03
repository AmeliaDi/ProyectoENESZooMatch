import { changeChatPin, createChatPin } from "@/application/chat";
import { changePinSchema, createPinSchema } from "@/application/validation/chat";
import {
  failureResponse,
  guardedChat,
  openedResponse,
  parseChatBody,
} from "@/infrastructure/chat/chat-route.server";
import { errorResponse } from "@/infrastructure/http/responses";
import { logServerEvent } from "@/infrastructure/observability/log.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create: `{ pin, confirm }` → `{ ok: true }` and an open lock session. */
async function handlePost(request: Request) {
  const body = await parseChatBody(request, createPinSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const created = await createChatPin(resolved.value.userId, body, resolved.value.deps);
  if (!created.ok) return failureResponse(created.error);
  logServerEvent("info", "chat.pin_created");
  return openedResponse(resolved.value);
}

/** Change: `{ current, pin, confirm }` → `{ ok: true }` and a fresh lock session. */
async function handlePut(request: Request) {
  const body = await parseChatBody(request, changePinSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const changed = await changeChatPin(resolved.value.userId, body, resolved.value.deps);
  if (!changed.ok) return failureResponse(changed.error);
  logServerEvent("info", "chat.pin_changed");
  return openedResponse(resolved.value);
}

const methods = ["POST", "PUT"] as const;
const policy = { name: "chat-pin", limit: 20, windowSeconds: 60, methods };

export const POST = withApiSecurity(handlePost, policy);
export const PUT = withApiSecurity(handlePut, policy);
export const OPTIONS = createPreflightHandler(methods);
