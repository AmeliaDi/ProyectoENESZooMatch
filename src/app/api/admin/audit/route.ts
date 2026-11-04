import { listAudit } from "@/application/admin";
import { adminRoute, pageParam } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleGet = adminRoute((gate, request) => listAudit(pageParam(request), gate.context.deps));

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-audit", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
