import { sendMessage } from "@/application/chat";
import { messageSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Free-chat message; idempotent by `clientKey`, capped per minute and per day. */
const handlePost = conversationAction(messageSchema, sendMessage);

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-message", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
