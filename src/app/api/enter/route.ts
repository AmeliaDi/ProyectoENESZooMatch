import { enterRequestSchema, parseJsonBody } from "@/application/validation/common";
import { clientAddress } from "@/infrastructure/auth/access-guard.server";
import { enterWithMatricula } from "@/infrastructure/auth/matricula-session.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePost(request: Request) {
  const parsed = enterRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const result = await enterWithMatricula({
    matricula: parsed.data.matricula,
    accessKey: parsed.data.accessKey,
    address: clientAddress(request.headers),
  });
  if (result.ok) {
    return jsonResponse({ ok: true, redirect: result.redirect, draftOwner: result.draftOwner });
  }

  switch (result.reason) {
    case "invalid_key":
      return errorResponse("auth.invalid_credentials");
    case "locked": {
      const response = errorResponse("auth.locked");
      response.headers.set("Retry-After", String(result.retryAfter));
      return response;
    }
    case "misconfigured":
      return errorResponse("service.misconfigured");
    default:
      return errorResponse("service.unavailable");
  }
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "enter",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
