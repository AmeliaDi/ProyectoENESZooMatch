"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AtlasShell } from "@/ui/kit/atlas-shell";
import { ErrorState } from "@/ui/kit/states";

import { isModuleId } from "./refine-flow";
import { RefineQuiz } from "./refine-quiz";

/** `/afinar?modulo=<id>`: unknown ids fall back to "Tu carta", where the menu lives. */
export function RefinePage() {
  const requested = useSearchParams().get("modulo");
  if (isModuleId(requested)) return <RefineQuiz module={requested} />;
  return (
    <AtlasShell plate="Lámina 07 · afinar">
      <main className="zm-center">
        <ErrorState
          title="Ese módulo no existe"
          body="Elige un módulo desde tu carta."
          action={
            <Link href="/perfil" className="zm-box zm-btn zm-btn--primary">
              Ir a mi carta
            </Link>
          }
        />
      </main>
    </AtlasShell>
  );
}
