import { completePinRecovery } from "@/application/chat";
import { createPinSchema } from "@/application/validation/chat";
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

/** After the wait: `{ pin, confirm }` → `{ ok: true }`. Only the PIN changes. */
async function handlePost(request: Request) {
  const body = await parseChatBody(request, createPinSchema);
  if (!body) return errorResponse("request.invalid");
  const resolved = await guardedChat(request);
  if (!resolved.ok) return resolved.error;
  const completed = await completePinRecovery(resolved.value.userId, body, resolved.value.deps);
  if (!completed.ok) return failureResponse(completed.error);
  logServerEvent("info", "chat.recovery_completed");
  return openedResponse(resolved.value);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-recovery-complete", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
