import { unlockChat } from "@/application/chat";
import { unlockSchema } from "@/application/validation/chat";
import {
  failureResponse,
  guardedChat,
  openedResponse,
  parseChatBody,
} from "@/infrastructure/chat/chat-route.server";
import { errorResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `{ pin }` → `{ ok: true }` plus the lock-session cookie. A wrong guess gets
 * `chat.pin_invalid` (with `attemptsLeft`) or `chat.pin_paused` (with `retryAfter`).
 */
async function handlePost(request: Request) {
  const body = await parseChatBody(request, unlockSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const unlocked = await unlockChat(resolved.value.userId, body.pin, resolved.value.deps);
  if (!unlocked.ok) return failureResponse(unlocked.error);
  return openedResponse(resolved.value);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-unlock", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
