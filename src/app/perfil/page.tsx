import type { Metadata } from "next";

import { ProfileView } from "@/ui/profile/profile-view";

export const metadata: Metadata = { title: "Tu carta | ZooMatch" };

export default function PerfilPage() {
  return <ProfileView />;
}
