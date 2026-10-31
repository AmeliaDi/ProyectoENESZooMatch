import { getResult } from "@/application/get-result";
import { resultContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const context = await resultContext();
  if (!context.ok) return errorResponse(context.error);

  const result = await getResult(context.value.userId, context.value.deps);
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "result",
  limit: 60,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
