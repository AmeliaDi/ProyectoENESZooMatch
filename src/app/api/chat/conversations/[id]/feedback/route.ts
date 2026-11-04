import { roundFeedback } from "@/application/chat";
import { feedbackSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "¿Te gustó la conversación?": aggregate-only, never shown to anyone. */
const handlePost = conversationAction(feedbackSchema, (id, viewer, body, deps) => roundFeedback(id, viewer, body, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-feedback", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
