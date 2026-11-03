import { sendMessage } from "@/application/chat";
import { messageSchema } from "@/application/validation/chat";
import { err } from "@/domain/shared";
import { parseChatBody } from "@/infrastructure/chat/chat-route.server";
import { withConversation } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a free-chat message (only in the `free` stage). */
async function handlePost(request: Request) {
  return withConversation(request, async ({ context }, id) => {
    const body = await parseChatBody(request, messageSchema);
    if (!body) return err("request.invalid" as const);
    return sendMessage(id, context.userId, body, { conversations: context.conversations, clock: context.deps.clock });
  });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-message", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
