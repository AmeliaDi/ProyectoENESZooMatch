import type { Metadata } from "next";

import { AdminLogin } from "@/components/admin-login";

export const metadata: Metadata = {
  title: "Acceso administrativo · ZooMatch",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLogin />;
}
