import { NextResponse } from "next/server";

import { getAdminContext, loadAdminMetricsV2 } from "@/lib/admin-auth.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const context = await getAdminContext();
  if (context.status === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (context.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (context.status === "unavailable") {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const metrics = await loadAdminMetricsV2(context);
  if (!metrics) {
    return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 });
  }

  return NextResponse.json(metrics);
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "admin-metrics-v2",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
