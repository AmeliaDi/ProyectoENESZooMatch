import { getChatStatus } from "@/application/chat";
import { touchLockSession } from "@/domain/chat";
import { failureResponse, readLockSession, resolveChat } from "@/infrastructure/chat/chat-route.server";
import { clearLockCookie, setLockCookie } from "@/infrastructure/chat/lock-cookie.server";
import { jsonResponse } from "@/infrastructure/http/chat-responses";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DTO: `ChatStatusDto` (never a hash, salt or attempt internals). */
async function handleGet(request: Request) {
  const resolved = await resolveChat();
  if (!resolved.ok) return resolved.error;
  const context = resolved.value;
  const session = readLockSession(request, context);
  const status = await getChatStatus(context.userId, session !== null, context.deps);
  if (!status.ok) return failureResponse(status.error);
  const response = jsonResponse(status.value);
  const now = context.deps.clock.now();
  if (session && status.value.unlocked) setLockCookie(response, touchLockSession(session, now), now, context.pepper);
  else clearLockCookie(response);
  return response;
}

const methods = ["GET"] as const;

export const GET = withChatApiSecurity(handleGet, { name: "chat-status", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
