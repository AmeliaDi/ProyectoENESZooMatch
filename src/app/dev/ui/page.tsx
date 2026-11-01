import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UiGallery } from "@/ui/dev/ui-gallery";

export const metadata: Metadata = {
  title: "Sistema de diseño · dev | ZooMatch",
  description: "Galería de desarrollo del kit Atlas de bolsillo: componentes, estados, modos e iconos.",
};

/** Ruta de sólo desarrollo: en producción responde 404. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiGallery />;
}
