import { markIdentityRevealed } from "@/application/revelation";
import { revelationContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/identity/revealed — consumes the one-time hatch animation. */
async function handlePost() {
  const context = await revelationContext();
  if (!context.ok) return errorResponse(context.error);
  const result = await markIdentityRevealed(context.value.userId, context.value.deps);
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "identity-revealed",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
