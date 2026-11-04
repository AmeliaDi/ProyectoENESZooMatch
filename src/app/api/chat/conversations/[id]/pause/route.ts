import { setPaused } from "@/application/chat";
import { toggleSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pauses or resumes the conversation (only who paused can resume). */
const handlePost = conversationAction(toggleSchema, (id, viewer, body, deps) => setPaused(id, viewer, body.on, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-pause", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
