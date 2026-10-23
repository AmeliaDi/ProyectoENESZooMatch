import { NextResponse } from "next/server";

import { getAdminContext } from "@/lib/admin-auth.server";
import { parseAdminMetricsV2, type AdminMetricsV2 } from "@/lib/admin-dashboard-v2";
import { getAmistadThreshold, getRomanceThreshold } from "@/lib/matching-config-v2";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `jsonb_agg` / `jsonb_object_agg` return SQL NULL for empty sets. Coercing
 * those to empty containers keeps an unpopulated habitat readable instead of
 * failing validation.
 */
function normalizeAggregates(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const payload = raw as Record<string, unknown>;

  return {
    ...payload,
    topAnimals: Array.isArray(payload.topAnimals) ? payload.topAnimals : [],
    topColors: Array.isArray(payload.topColors) ? payload.topColors : [],
    mbtiDistribution:
      payload.mbtiDistribution &&
      typeof payload.mbtiDistribution === "object" &&
      !Array.isArray(payload.mbtiDistribution)
        ? payload.mbtiDistribution
        : {},
  };
}

async function loadMetricsV2(
  context: Extract<Awaited<ReturnType<typeof getAdminContext>>, { status: "ok" }>,
): Promise<AdminMetricsV2 | null> {
  const { data, error } = await context.client.rpc("get_admin_dashboard_v2", {
    p_romance_threshold: getRomanceThreshold(),
    p_amistad_threshold: getAmistadThreshold(),
  });
  if (error) return null;
  return parseAdminMetricsV2(normalizeAggregates(data));
}

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

  const metrics = await loadMetricsV2(context);
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
