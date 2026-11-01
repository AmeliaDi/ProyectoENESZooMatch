import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PhysicsPanel } from "./physics-panel";

export const metadata: Metadata = {
  title: "Física · dev | ZooMatch",
  description: "Panel de afinación en vivo de la física de la constelación, con métricas y escenarios.",
};

/** Ruta de sólo desarrollo: en producción responde 404. */
export default function DevPhysicsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <Suspense>
      <PhysicsPanel />
    </Suspense>
  );
}
