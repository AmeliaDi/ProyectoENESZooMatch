"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { claimDeviceDrafts, clearDeviceDrafts } from "@/ui/shared/device-drafts";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";

export type EntryFailure = "unavailable" | "misconfigured" | "locked";

interface EnterBody {
  ok?: boolean;
  redirect?: string;
  draftOwner?: string;
  code?: string;
}

function failureFor(status: number, code: string | undefined): EntryFailure {
  if (code === "auth.locked" || status === 429) return "locked";
  if (code === "service.misconfigured") return "misconfigured";
  return "unavailable";
}

/** POST /api/enter; local drafts are bound to whoever enters (ADR-023). */
export function useEntry(inclusiveMode: InclusiveMode) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<EntryFailure | null>(null);
  const lock = useRef(false);

  async function enter(matricula: string) {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setFailed(null);
    try {
      const response = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula, inclusiveMode }),
      });
      const body = (await response.json().catch(() => null)) as EnterBody | null;
      if (response.ok && body?.ok && typeof body.redirect === "string" && typeof body.draftOwner === "string") {
        claimDeviceDrafts(body.draftOwner);
        router.replace(body.redirect as Route);
        return;
      }
      // The server already signed the previous session out; mirror it locally.
      clearDeviceDrafts();
      setFailed(failureFor(response.status, body?.code));
    } catch {
      setFailed("unavailable");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return { enter, submitting, failed, clearFailure: () => setFailed(null) };
}
