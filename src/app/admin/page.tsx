import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadAdminMetrics } from "@/application/admin-metrics";
import { AdminDashboard } from "@/ui/admin/admin-dashboard";
import { adminContext } from "@/infrastructure/composition.server";

export const metadata: Metadata = {
  title: "Observatorio administrativo · ZooMatch",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await adminContext();
  if (!context.ok) redirect("/admin/login");

  const metrics = await loadAdminMetrics(context.value);
  return <AdminDashboard initialData={metrics.ok ? metrics.value : null} />;
}
