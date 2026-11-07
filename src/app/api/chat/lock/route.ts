import { clearLockCookie } from "@/infrastructure/chat/lock-cookie.server";
import { jsonResponse } from "@/infrastructure/http/chat-responses";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Closes the lock. No body and no session needed, so `navigator.sendBeacon`
 * on `pagehide` works; idempotent.
 */
async function handlePost() {
  const response = jsonResponse({ ok: true });
  clearLockCookie(response);
  return response;
}

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "chat-lock", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
