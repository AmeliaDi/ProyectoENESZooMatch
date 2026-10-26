import {
  parseAdminMetrics,
  type AdminMetrics,
} from "@/lib/admin/dashboard";
import { getAmistadThreshold, getRomanceThreshold } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";

export async function getAdminContext() {
  const client = await createClient();
  if (!client) return { status: "unavailable" as const };

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return { status: "unauthorized" as const };
  }

  const { data: role, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || role?.role !== "admin") {
    return { status: "forbidden" as const };
  }

  return { status: "ok" as const, client };
}

function normalizeMetricsAggregates(raw: unknown): unknown {
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

export async function loadAdminMetrics(
  context: Extract<Awaited<ReturnType<typeof getAdminContext>>, { status: "ok" }>,
): Promise<AdminMetrics | null> {
  const { data, error } = await context.client.rpc("get_admin_dashboard_v2", {
    p_romance_threshold: getRomanceThreshold(),
    p_amistad_threshold: getAmistadThreshold(),
  });
  if (error) return null;
  return parseAdminMetrics(normalizeMetricsAggregates(data));
}
