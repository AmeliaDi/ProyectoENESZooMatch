import { setMuted } from "@/application/chat";
import { toggleSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Silences notices from this conversation for the viewer only. */
const handlePost = conversationAction(toggleSchema, (id, viewer, body, deps) => setMuted(id, viewer, body.on, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-mute", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
