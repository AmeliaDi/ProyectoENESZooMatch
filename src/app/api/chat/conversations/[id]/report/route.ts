import { reportConversation } from "@/application/chat";
import { reportSchema } from "@/application/validation/chat";
import { conversationAction, okBody } from "@/infrastructure/chat/conversation-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Report: minimal snapshot for moderation plus a silent block. */
const handlePost = conversationAction(reportSchema, async (id, viewer, body, deps) => okBody(await reportConversation(id, viewer, body.reason, deps)));

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "chat-report", limit: 5, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
