import { reactToAnswer } from "@/application/chat";
import { reactSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quick emoji reaction to the other side's revealed answer. */
const handlePost = conversationAction(reactSchema, (id, viewer, body, deps) => reactToAnswer(id, viewer, body, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-react", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
