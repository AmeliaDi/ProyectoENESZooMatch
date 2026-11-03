import { getInbox } from "@/application/chat";
import { requireChatLock } from "@/infrastructure/chat/chat-route.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The viewer's conversations. Without an open lock: `chat.locked` and no data. */
async function handleGet(request: Request) {
  const open = await requireChatLock(request);
  if (!open.ok) return open.error;
  const { context } = open.value;
  const inbox = await getInbox(context.userId, { conversations: context.conversations, clock: context.deps.clock });
  return open.value.renew(inbox.ok ? jsonResponse(inbox.value) : errorResponse(inbox.error));
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "chat-inbox", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
