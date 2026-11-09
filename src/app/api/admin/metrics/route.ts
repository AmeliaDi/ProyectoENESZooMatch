import { loadAdminMetrics } from "@/application/admin-metrics";
import { adminRoute, daysParam } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `?days=7|30|90`; anything else reads the configured window. */
const handleGet = adminRoute((gate, request) => loadAdminMetrics(gate.context.metrics, daysParam(request)));

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-metrics", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
