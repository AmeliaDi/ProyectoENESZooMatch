import { askQuestion } from "@/application/chat";
import { askSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens the next round: a suggested card, or an own question in free chat. */
const handlePost = conversationAction(askSchema, (id, viewer, body, deps) => askQuestion(id, viewer, body, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-ask", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
