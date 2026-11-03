import { requireChatLock } from "@/infrastructure/chat/chat-route.server";
import { jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Placeholder of the chat inbox: proves the contract every chat route will
 * follow. Without an open lock it answers `chat.locked` and no data.
 */
async function handleGet(request: Request) {
  const open = await requireChatLock(request);
  if (!open.ok) return open.error;
  return open.value.renew(jsonResponse({ conversations: [] }));
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "chat-inbox", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
