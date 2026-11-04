import type { Metadata } from "next";

import { AdminConsole } from "@/ui/admin/admin-console";

export const metadata: Metadata = {
  title: "Observatorio administrativo · ZooMatch",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The console session cookie is scoped to `/api/admin` (never sent to pages),
 * so the console checks it client-side through `/api/admin/session` and sends
 * anyone without it to `/admin/login`. No data is rendered on the server.
 */
export default function AdminPage() {
  return <AdminConsole />;
}
