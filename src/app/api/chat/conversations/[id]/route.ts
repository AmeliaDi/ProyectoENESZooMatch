import { getConversation, leaveConversation } from "@/application/chat";
import { withConversation } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One conversation (marks it as seen). Not the viewer's → `chat.not_found`. */
async function handleGet(request: Request) {
  return withConversation(request, ({ context }, id) =>
    getConversation(id, context.userId, { conversations: context.conversations, clock: context.deps.clock }),
  );
}

/** Leaving without explanation: deleted for both, the other person is not notified. */
async function handleDelete(request: Request) {
  return withConversation(request, async ({ context }, id) => {
    const left = await leaveConversation(id, context.userId, { conversations: context.conversations, clock: context.deps.clock });
    return left.ok ? { ok: true as const, value: { ok: true } } : left;
  });
}

const methods = ["GET", "DELETE"] as const;

export const GET = withApiSecurity(handleGet, { name: "chat-conversation", limit: 60, windowSeconds: 60, methods });
export const DELETE = withApiSecurity(handleDelete, { name: "chat-leave", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
