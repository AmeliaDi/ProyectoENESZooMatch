import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NumbersGallery } from "@/ui/dev/numbers-gallery";

export const metadata: Metadata = {
  title: "Números legibles · dev | ZooMatch",
  description: "Comparación de cifras: Pixelify, Atkinson tabular y el atlas pixel 5×7 (ADR-028).",
};

/** Ruta de sólo desarrollo: en producción responde 404. */
export default function DevNumerosPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <NumbersGallery />;
}
