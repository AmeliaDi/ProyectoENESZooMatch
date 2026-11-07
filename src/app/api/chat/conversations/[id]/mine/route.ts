import { deleteMyMessages } from "@/application/chat";
import { emptySchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes the viewer's own messages and answer texts (their side only). */
const handlePost = conversationAction(emptySchema, (id, viewer, _body, deps) => deleteMyMessages(id, viewer, deps));

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "chat-mine", limit: 5, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
