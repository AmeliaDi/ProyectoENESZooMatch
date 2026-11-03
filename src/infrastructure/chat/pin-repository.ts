/**
 * Supabase adapter of `ChatPinRepository`. `chat_pins` and
 * `chat_security_events` have RLS with no client policies: only this
 * service-role adapter reads them, and `pin_hash`/`salt` never leave it.
 */
import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { StorageError } from "@/application/errors";
import {
  CHAT_SECURITY_EVENT_KINDS,
  type ChatPinPatch,
  type ChatPinRecord,
  type ChatPinRepository,
  type MatriculaVerifier,
} from "@/application/ports";
import { ok, type Result } from "@/domain/shared";
import { hashMatricula } from "@/infrastructure/auth/identity.server";
import { TABLE, attempt, failed } from "@/infrastructure/supabase/shared";

const UNIQUE_VIOLATION = "23505";

const PIN_COLUMNS = [
  "pin_hash", "salt", "kdf_params", "created_at", "changed_at", "failed_attempts", "pause_step",
  "long_pauses", "locked_until", "recent_failures", "last_failed_at", "recovery_requested_at", "revision",
].join(", ");

const date = z.string().transform((value) => new Date(value));
const kdfSchema = z.object({
  algorithm: z.literal("scrypt"),
  log2N: z.number().int(),
  r: z.number().int(),
  p: z.number().int(),
  keyLen: z.number().int(),
});

const rowSchema = z.object({
  pin_hash: z.string(),
  salt: z.string(),
  kdf_params: kdfSchema,
  created_at: date,
  changed_at: date,
  failed_attempts: z.number().int(),
  pause_step: z.number().int(),
  long_pauses: z.number().int(),
  locked_until: date.nullable(),
  recent_failures: z.number().int(),
  last_failed_at: date.nullable(),
  recovery_requested_at: date.nullable(),
  revision: z.number().int(),
});

const eventSchema = z.object({ kind: z.enum(CHAT_SECURITY_EVENT_KINDS), created_at: date });

function toRecord(row: z.output<typeof rowSchema>): ChatPinRecord {
  return {
    digest: { hash: row.pin_hash, salt: row.salt, params: row.kdf_params },
    createdAt: row.created_at,
    changedAt: row.changed_at,
    attempts: {
      failedAttempts: row.failed_attempts,
      pauseStep: row.pause_step,
      longPauses: row.long_pauses,
      lockedUntil: row.locked_until,
    },
    recentFailures: row.recent_failures,
    lastFailedAt: row.last_failed_at,
    recoveryRequestedAt: row.recovery_requested_at,
    revision: row.revision,
  };
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** Column patch; `revision` is bumped by a trigger, never written here. */
function toRow(patch: ChatPinPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.digest) Object.assign(row, { pin_hash: patch.digest.hash, salt: patch.digest.salt, kdf_params: patch.digest.params });
  if (patch.changedAt) row.changed_at = patch.changedAt.toISOString();
  if (patch.attempts) {
    const a = patch.attempts;
    Object.assign(row, { failed_attempts: a.failedAttempts, pause_step: a.pauseStep, long_pauses: a.longPauses, locked_until: iso(a.lockedUntil) });
  }
  if (patch.recentFailures !== undefined) row.recent_failures = patch.recentFailures;
  if (patch.lastFailedAt !== undefined) row.last_failed_at = iso(patch.lastFailedAt);
  if (patch.recoveryRequestedAt !== undefined) row.recovery_requested_at = iso(patch.recoveryRequestedAt);
  return row;
}

export function supabaseChatPinRepository(admin: SupabaseClient): ChatPinRepository {
  return {
    async find(userId) {
      const res = await attempt(() => admin.from(TABLE.chatPins).select(PIN_COLUMNS).eq("user_id", userId).maybeSingle());
      if (!res || res.error) return failed;
      if (!res.data) return ok(null);
      const parsed = rowSchema.safeParse(res.data);
      return parsed.success ? ok(toRecord(parsed.data)) : failed;
    },
    async create(userId, digest, at) {
      const row = { user_id: userId, ...toRow({ digest, changedAt: at }), created_at: at.toISOString() };
      const res = await attempt(() => admin.from(TABLE.chatPins).insert(row));
      if (!res) return failed;
      if (res.error) return res.error.code === UNIQUE_VIOLATION ? ok(false) : failed;
      return ok(true);
    },
    async update(userId, revision, patch) {
      const res = await attempt(() => {
        const query = admin.from(TABLE.chatPins).update(toRow(patch)).eq("user_id", userId);
        return (revision === null ? query : query.eq("revision", revision)).select("user_id");
      });
      return res && !res.error ? ok((res.data?.length ?? 0) > 0) : failed;
    },
    async recordEvent(userId, kind, at) {
      const row = { user_id: userId, kind, created_at: at.toISOString() };
      const res = await attempt(() => admin.from(TABLE.chatEvents).insert(row));
      return res && !res.error ? ok(undefined) : failed;
    },
    async listEvents(userId, limit) {
      const res = await attempt(() =>
        admin.from(TABLE.chatEvents).select("kind, created_at").eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(limit),
      );
      if (!res || res.error) return failed;
      const parsed = z.array(eventSchema).safeParse(res.data ?? []);
      return parsed.success ? ok(parsed.data.map((e) => ({ kind: e.kind, at: e.created_at }))) : failed;
    },
  };
}

/** Compares HMAC digests in constant time; the matrícula is never stored or logged. */
export function supabaseMatriculaVerifier(admin: SupabaseClient, secret: string): MatriculaVerifier {
  return {
    async matches(userId, matricula): Promise<Result<boolean, StorageError>> {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select("matricula_hash").eq("user_id", userId).maybeSingle<{ matricula_hash: string }>(),
      );
      if (!res || res.error) return failed;
      const stored = Buffer.from(res.data?.matricula_hash ?? "", "utf8");
      const typed = Buffer.from(hashMatricula(matricula, secret), "utf8");
      return ok(stored.length === typed.length && timingSafeEqual(stored, typed));
    },
  };
}
