import { expressInterest, interestStates, withdrawInterest } from "@/application/chat";
import { interestSchema } from "@/application/validation/chat";
import { interestBody, withInterest } from "@/infrastructure/chat/interest-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signals ❤️ / 🤗 (docs/CHAT.md §10.1). Outside the chat lock on purpose:
 * it only reveals the viewer's own signals, invitations received and whether
 * a chat opened — never whether someone declined.
 */
const handleGet = () => withInterest(({ userId, deps }) => interestStates(userId, deps));

const handlePost = (request: Request) =>
  withInterest(async ({ userId, deps }) => {
    const body = await interestBody(request, interestSchema);
    return body.ok ? expressInterest(userId, body.value, deps) : body;
  });

const handleDelete = (request: Request) =>
  withInterest(async ({ userId, deps }) => {
    const body = await interestBody(request, interestSchema);
    return body.ok ? withdrawInterest(userId, body.value, deps) : body;
  });

const methods = ["GET", "POST", "DELETE"] as const;

export const GET = withChatApiSecurity(handleGet, { name: "interest-read", limit: 30, windowSeconds: 60, methods });
export const POST = withChatApiSecurity(handlePost, { name: "interest-send", limit: 20, windowSeconds: 60, methods });
export const DELETE = withChatApiSecurity(handleDelete, { name: "interest-withdraw", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
