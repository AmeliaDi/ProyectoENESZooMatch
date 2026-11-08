import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NumbersGallery } from "@/ui/dev/numbers-gallery";
import { LigatureGallery } from "@/ui/dev/ligature-gallery";

export const metadata: Metadata = {
  title: "Tipografía · dev | ZooMatch",
  description: "Comparación de cifras y verificación de ligaduras deshabilitadas (Pixelify + Atkinson).",
};

/** Ruta de sólo desarrollo: en producción responde 404. */
export default function DevTipografiaPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <>
      <LigatureGallery />
      <NumbersGallery />
    </>
  );
}