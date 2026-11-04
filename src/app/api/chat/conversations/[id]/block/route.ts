import { blockInConversation } from "@/application/chat";
import { emptySchema } from "@/application/validation/chat";
import { conversationAction, okBody } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Silent block: the pair's chats and signals disappear; nobody is told. */
const handlePost = conversationAction(emptySchema, async (id, viewer, _body, deps) => okBody(await blockInConversation(id, viewer, deps)));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-block", limit: 5, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
