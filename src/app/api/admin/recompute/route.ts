import { recomputeMatches } from "@/application/recompute-matches";
import { adminContext, recomputeDeps } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePost() {
  const context = await adminContext();
  if (!context.ok) return errorResponse(context.error);

  const deps = recomputeDeps();
  if (!deps.ok) return errorResponse(deps.error);

  const pairs = await recomputeMatches(deps.value);
  return pairs.ok
    ? jsonResponse({ ok: true, pairs: pairs.value.length })
    : errorResponse(pairs.error);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "admin-recompute",
  limit: 5,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
