import { errorResponse } from "@/infrastructure/http/chat-responses";
import { withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Any path under `/api/chat` that no route owns answers the same JSON
 * envelope as the rest of the surface. Without this, Next serves its static
 * HTML 404 — 61 kB of `text/html` that Vercel then caches at the edge, which
 * is exactly the "the API returned something unreadable" class of bug.
 */
const unknown = async () => errorResponse("request.unknown_route");

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const policy = { name: "chat-unknown", limit: 30, windowSeconds: 60, methods };

export const GET = withChatApiSecurity(unknown, policy);
export const POST = withChatApiSecurity(unknown, policy);
export const PUT = withChatApiSecurity(unknown, policy);
export const PATCH = withChatApiSecurity(unknown, policy);
export const DELETE = withChatApiSecurity(unknown, policy);
export const OPTIONS = withChatApiSecurity(unknown, policy);