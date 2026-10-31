import { loadAdminMetrics } from "@/application/admin-metrics";
import { adminContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const context = await adminContext();
  if (!context.ok) return errorResponse(context.error);

  const metrics = await loadAdminMetrics(context.value);
  return metrics.ok ? jsonResponse(metrics.value) : errorResponse(metrics.error);
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "admin-metrics",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
