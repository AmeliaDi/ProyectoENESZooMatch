import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdminContext, loadAdminMetricsV2 } from "@/lib/admin-auth.server";

export const metadata: Metadata = {
  title: "Observatorio administrativo · ZooMatch",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await getAdminContext();
  if (context.status !== "ok") redirect("/admin/login");

  const metrics = await loadAdminMetricsV2(context);
  return <AdminDashboard initialData={metrics} />;
}
