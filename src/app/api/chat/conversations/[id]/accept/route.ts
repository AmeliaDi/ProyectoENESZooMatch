import { acceptFreeChat } from "@/application/chat";
import { acceptSchema } from "@/application/validation/chat";
import { err } from "@/domain/shared";
import { parseChatBody } from "@/infrastructure/chat/chat-route.server";
import { withConversation } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accepts the free chat; it opens only once both accepted. */
async function handlePost(request: Request) {
  return withConversation(request, async ({ context }, id) => {
    if (!(await parseChatBody(request, acceptSchema))) return err("request.invalid" as const);
    return acceptFreeChat(id, context.userId, { conversations: context.conversations, clock: context.deps.clock });
  });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-accept", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
