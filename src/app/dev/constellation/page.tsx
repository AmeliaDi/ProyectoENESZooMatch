import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConstellationDevPanel } from "./constellation-dev-panel";

export const metadata: Metadata = {
  title: "Constelación · dev | ZooMatch",
  description:
    "Herramienta de desarrollo para previsualizar la constelación con datos sintéticos, sin tocar Supabase ni la red.",
};

/**
 * Ruta de sólo desarrollo. La constelación con datos sintéticos es una herramienta
 * interna de ajuste del motor de render, así que en producción devolvemos 404
 * antes de renderizar nada (mismo patrón que `/dev/sprites`).
 */
export default function DevConstellationPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ConstellationDevPanel />;
}
