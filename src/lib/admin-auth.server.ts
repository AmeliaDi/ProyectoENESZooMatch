import { getMatchingThreshold } from "@/lib/matching-config";
import { parseAdminMetrics, type AdminMetrics } from "@/lib/admin-dashboard";
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

export async function loadAdminMetrics(
  context: Extract<Awaited<ReturnType<typeof getAdminContext>>, { status: "ok" }>,
): Promise<AdminMetrics | null> {
  const { data, error } = await context.client.rpc("get_admin_dashboard", {
    p_threshold: getMatchingThreshold(),
  });
  if (error) return null;
  return parseAdminMetrics(data);
}
