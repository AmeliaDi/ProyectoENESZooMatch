import { availabilityRequestSchema, parseJsonBody } from "@/application/validation/common";
import { enterWithMatricula } from "@/infrastructure/auth/matricula-session.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = availabilityRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const result = await enterWithMatricula(parsed.data.matricula);
  if (!result) return errorResponse("service.unavailable");

  return jsonResponse({ ok: true, redirect: result.redirect });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "enter",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
