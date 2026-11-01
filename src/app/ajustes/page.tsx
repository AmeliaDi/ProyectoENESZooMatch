import type { Metadata } from "next";

import { SettingsView } from "@/ui/settings/settings-view";

export const metadata: Metadata = { title: "Ajustes y privacidad | ZooMatch" };

export default function AjustesPage() {
  return <SettingsView />;
}
