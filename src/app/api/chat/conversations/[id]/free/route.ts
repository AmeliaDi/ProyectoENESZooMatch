import { setFreeChat } from "@/application/chat";
import { freeSchema } from "@/application/validation/chat";
import { conversationAction } from "@/infrastructure/chat/conversation-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proposes/accepts free chat (both must) or takes the proposal back. */
const handlePost = conversationAction(freeSchema, (id, viewer, body, deps) => setFreeChat(id, viewer, body.ready, deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "chat-free", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
