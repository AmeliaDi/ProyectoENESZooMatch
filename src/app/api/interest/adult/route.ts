import { confirmAdult } from "@/application/chat";
import { emptySchema } from "@/application/validation/chat";
import { interestBody, withInterest } from "@/infrastructure/chat/interest-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Self-declared 18+ (ADR-035), needed for romance chats. Cannot be undone from the app. */
const handlePost = (request: Request) =>
  withInterest(async ({ userId, deps }) => {
    const body = await interestBody(request, emptySchema);
    return body.ok ? confirmAdult(userId, deps) : body;
  });

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "interest-adult", limit: 5, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
