"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/ui/kit/icon";

import { RECOMPUTE_PENDING_KEY } from "./chrome";
import { clearDeviceDrafts } from "./device-drafts";

/**
 * Ends the session on this device and wipes local drafts, so the next person
 * on a shared phone or lab computer starts from a clean sky (ADR-023).
 */
export function ExitButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    if (busy) return;
    setBusy(true);
    await fetch("/api/exit", { method: "POST" }).catch(() => undefined);
    clearDeviceDrafts();
    try {
      window.sessionStorage.removeItem(RECOMPUTE_PENDING_KEY);
    } catch {
      // Storage unavailable: nothing to clean.
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      className="zm-box zm-btn zm-btn--ghost zm-btn--icon"
      aria-label="Salir de este dispositivo"
      title="Salir"
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => void exit()}
    >
      <Icon name={busy ? "loading" : "logout"} />
    </button>
  );
}
