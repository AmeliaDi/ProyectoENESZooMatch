import { answerRound } from "@/application/chat";
import { answerSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Answers (or passes) the open round; answers stay sealed until both answered. */
const handlePost = conversationAction(answerSchema, answerRound);

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "chat-answer", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
