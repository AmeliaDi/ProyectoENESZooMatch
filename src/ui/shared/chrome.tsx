"use client";

import { AtlasShell } from "@/ui/kit/atlas-shell";
import { LoadingState } from "@/ui/kit/states";

/** Session key set when the quiz was saved but the global recompute failed. */
export const RECOMPUTE_PENDING_KEY = "zoomatch:recompute-pending";

export type ApiError = "generic" | "session" | null;

/** Full-screen loading that is part of the sky (stars switching on). */
export function LoadingFrame({ label, plate }: { label: string; plate?: string }) {
  return (
    <AtlasShell {...(plate ? { plate } : {})}>
      <main className="zm-center">
        <LoadingState title={label} />
      </main>
    </AtlasShell>
  );
}
