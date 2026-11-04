import { getConversation, leaveConversation } from "@/application/chat";
import { viewQuerySchema } from "@/application/validation/chat";
import { conversationDeps, withConversation } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One conversation (marks it as seen). `?refresh=n` pages the question
 * cards ("otras tres"); `?before=<iso>` pages older messages. Not the
 * viewer's → `chat.not_found`. Retention runs here, opportunistically.
 */
async function handleGet(request: Request) {
  return withConversation(request, async (open, id) => {
    const query = viewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    const options = query.success
      ? { ...(query.data.refresh === undefined ? {} : { refresh: query.data.refresh }), ...(query.data.before ? { before: new Date(query.data.before) } : {}) }
      : {};
    await open.context.conversations.purge();
    return getConversation(id, open.context.userId, conversationDeps(open), options);
  });
}

/** Closing without explanation: deleted for both, the other person is not notified. */
async function handleDelete(request: Request) {
  return withConversation(request, async (open, id) => {
    const left = await leaveConversation(id, open.context.userId, conversationDeps(open));
    return left.ok ? { ok: true as const, value: { ok: true } } : left;
  });
}

const methods = ["GET", "DELETE"] as const;

export const GET = withApiSecurity(handleGet, { name: "chat-conversation", limit: 60, windowSeconds: 60, methods });
export const DELETE = withApiSecurity(handleDelete, { name: "chat-leave", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
