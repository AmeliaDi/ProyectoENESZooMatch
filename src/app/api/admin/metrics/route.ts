import { loadAdminMetrics } from "@/application/admin-metrics";
import { adminRoute } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handleGet = adminRoute((gate) => loadAdminMetrics(gate.context.metrics));

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-metrics", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
