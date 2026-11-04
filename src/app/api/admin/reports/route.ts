import { z } from "zod";

import { listReports } from "@/application/admin";
import { REPORT_STATUSES } from "@/contracts/admin";
import { adminRoute, pageParam } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(REPORT_STATUSES).nullable().catch(null);

/** `?status=abierto|revisado|cerrado&page=<n>` → reports with their snapshot. */
const handleGet = adminRoute((gate, request) => {
  const status = statusSchema.parse(new URL(request.url).searchParams.get("status"));
  return listReports(status, pageParam(request), gate.context.deps);
});

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-reports", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
