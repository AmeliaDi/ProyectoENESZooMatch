import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingFrame } from "@/ui/shared/chrome";
import { RefinePage } from "@/ui/refine/refine-page";

export const metadata: Metadata = { title: "Afinar tu perfil | ZooMatch" };

export default function AfinarPage() {
  return (
    <Suspense fallback={<LoadingFrame label="Abriendo el módulo…" plate="Lámina 07 · afinar" />}>
      <RefinePage />
    </Suspense>
  );
}
