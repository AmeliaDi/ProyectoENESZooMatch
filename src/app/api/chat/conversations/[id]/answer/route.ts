import { answerRound } from "@/application/chat";
import { answerSchema } from "@/application/validation/chat";
import { err } from "@/domain/shared";
import { parseChatBody } from "@/infrastructure/chat/chat-route.server";
import { withConversation } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Answers the current round; the other answer is revealed only when both answered. */
async function handlePost(request: Request) {
  return withConversation(request, async ({ context }, id) => {
    const body = await parseChatBody(request, answerSchema);
    if (!body) return err("request.invalid" as const);
    return answerRound(id, context.userId, body, { conversations: context.conversations, clock: context.deps.clock });
  });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-answer", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
