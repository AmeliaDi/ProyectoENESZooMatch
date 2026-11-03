import type { Metadata } from "next";

import { NotFoundView } from "@/ui/shared/lost-view";

export const metadata: Metadata = { title: "Fuera del mapa | ZooMatch" };

export default function NotFound() {
  return <NotFoundView />;
}
