import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AvatarGallery } from "@/ui/dev/avatar-gallery";

export const metadata: Metadata = {
  title: "Galería de avatares · dev | ZooMatch",
  description: "MBTI × eneatipo × ala × subtipo: silueta, color, emblema y marca de cada combinación.",
};

/** Ruta de sólo desarrollo: en producción responde 404. */
export default function DevAvatarsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <AvatarGallery />;
}
