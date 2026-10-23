import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SpriteGallery } from "@/components/sprite-gallery";

export const metadata: Metadata = {
  title: "Galería de sprites · dev | ZooMatch",
  description:
    "Herramienta de desarrollo para previsualizar todos los animalitos pixeleados generados por el motor de sprites.",
};

/**
 * Ruta de sólo desarrollo. En producción el catálogo completo de sprites es un
 * detalle interno del motor y no debe exponerse, así que devolvemos 404 antes
 * de renderizar nada.
 */
export default function DevSpritesPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <SpriteGallery />;
}
