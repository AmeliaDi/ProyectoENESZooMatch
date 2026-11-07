import { declineInterest } from "@/application/chat";
import { interestSchema } from "@/application/validation/chat";
import { interestBody, withInterest } from "@/infrastructure/chat/interest-route.server";
import { createChatPreflightHandler, withChatApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Ahora no": hides the invitation for the viewer; the sender is never told. */
const handlePost = (request: Request) =>
  withInterest(async ({ userId, deps }) => {
    const body = await interestBody(request, interestSchema);
    return body.ok ? declineInterest(userId, body.value, deps) : body;
  });

const methods = ["POST"] as const;

export const POST = withChatApiSecurity(handlePost, { name: "interest-decline", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createChatPreflightHandler(methods);
