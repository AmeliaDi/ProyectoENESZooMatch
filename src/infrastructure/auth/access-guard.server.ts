import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_CONFIG } from "@/config";

/**
 * Postgres-backed brute-force guard for `/api/enter` (ADR-023). It works with
 * no extra service (Upstash stays optional for the generic per-route limit).
 * Subjects are HMAC digests keyed with the server secret, so the table never
 * holds a raw IP address or matrícula.
 */
export type GuardKind = "address_attempt" | "address_failure" | "account_failure";

const RULES = {
  address_attempt: ACCESS_CONFIG.guard.attemptsPerAddress,
  address_failure: ACCESS_CONFIG.guard.failuresPerAddress,
  account_failure: ACCESS_CONFIG.guard.failuresPerAccount,
} as const satisfies Record<GuardKind, unknown>;

export function guardSubject(kind: "address" | "account", value: string, secret: string): string {
  return createHmac("sha256", secret).update(`access-guard:${kind}:${value}`, "utf8").digest("hex");
}

/** First address of the forwarding chain, as set by the Vercel edge. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-vercel-forwarded-for")
    ?? headers.get("x-forwarded-for")
    ?? headers.get("x-real-ip")
    ?? "";
  return forwarded.split(",")[0]?.trim() || "unresolved-client";
}

/** Seconds locked, or `null` when the guard itself failed (callers fail closed). */
type GuardAnswer = number | null;

function seconds(data: unknown, error: unknown): GuardAnswer {
  return error || typeof data !== "number" || !Number.isFinite(data) ? null : Math.max(0, data);
}

export function createAccessGuard(admin: SupabaseClient) {
  return {
    async hit(kind: GuardKind, subject: string): Promise<GuardAnswer> {
      const rule = RULES[kind];
      const { data, error } = await admin.rpc("access_guard_hit", {
        p_kind: kind,
        p_subject: subject,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
        p_lock_seconds: rule.lockSeconds,
      });
      return seconds(data, error);
    },
    async peek(kind: GuardKind, subject: string): Promise<GuardAnswer> {
      const { data, error } = await admin.rpc("access_guard_peek", { p_kind: kind, p_subject: subject });
      return seconds(data, error);
    },
    async clear(kind: GuardKind, subject: string): Promise<void> {
      await admin.rpc("access_guard_clear", { p_kind: kind, p_subject: subject });
    },
  };
}

export type AccessGuard = ReturnType<typeof createAccessGuard>;
