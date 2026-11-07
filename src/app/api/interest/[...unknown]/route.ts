import { errorResponse } from "@/infrastructure/http/chat-responses";
import { withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The interest signal speaks the chat envelope; an unknown path does too. */
const unknown = async () => errorResponse("request.unknown_route");

const methods = ["GET", "POST", "DELETE"] as const;
const policy = { name: "interest-unknown", limit: 30, windowSeconds: 60, methods };

export const GET = withChatApiSecurity(unknown, policy);
export const POST = withChatApiSecurity(unknown, policy);
export const DELETE = withChatApiSecurity(unknown, policy);
export const OPTIONS = withChatApiSecurity(unknown, policy);