/**
 * Supabase adapters for the application ports. All table/RPC names live here
 * and nowhere else. Adapters never throw: failures become `storage.failed`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  AdminRepository,
  MatchRepository,
  NotificationRecord,
  NotificationRepository,
  StoredMatch,
} from "@/application/ports";
import type { StorageError } from "@/application/errors";
import { normalizeMatchPairs } from "@/domain/matching";
import { ok, type Result } from "@/domain/shared";

import { POOL_CHANGED_SENTINEL, RPC, TABLE, attempt, failed } from "./shared";

export { RPC, TABLE } from "./shared";
export { supabaseProfileRepository } from "./profile-repository";

// ─── Matches ─────────────────────────────────────────────────────────────────

const matchRowSchema = z.object({
  track: z.enum(["romance", "amistad"]),
  other_user: z.string().nullable().optional(),
  similarity: z.number(),
  badges: z.array(z.object({ dimension: z.string(), affinity: z.number() })).nullable().optional(),
});

export function supabaseMatchRepository(admin: SupabaseClient): MatchRepository {
  return {
    async poolVersion() {
      const res = await attempt(() => admin.rpc(RPC.poolVersion));
      return res && !res.error && typeof res.data === "string" ? ok(res.data) : failed;
    },

    async replaceAll(pairs, poolVersion) {
      const normalized = normalizeMatchPairs(pairs);
      const res = await attempt(() =>
        admin.rpc(RPC.replace, {
          p_matches: normalized.map((pair) => ({
            track: pair.track,
            user_a: pair.userA,
            user_b: pair.userB,
            similarity: pair.similarity,
            badges: pair.badges,
          })),
          p_pool_version: poolVersion,
        }),
      );
      if (!res || res.error) return failed;
      return ok(res.data === POOL_CHANGED_SENTINEL ? "pool_changed" : "replaced");
    },

    async listFor(userId): Promise<Result<StoredMatch[], StorageError>> {
      const res = await attempt(() => admin.rpc(RPC.userMatches, { p_user_id: userId }));
      if (!res || res.error) return failed;
      const rows = z.array(matchRowSchema).safeParse(res.data ?? []);
      if (!rows.success) return failed;
      return ok(
        rows.data.map((row) => ({
          track: row.track,
          otherUser: row.other_user ?? null,
          similarity: row.similarity,
          badges: row.badges ?? [],
        })),
      );
    },
  };
}

// ─── Notifications ───────────────────────────────────────────────────────────

const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  read: z.boolean(),
  created_at: z.string(),
});

/**
 * `admin` (service role) writes notifications; `session` reads and marks the
 * viewer's own through RPCs that check auth.uid(). Pass `null` for `admin`
 * when the caller only reads.
 */
export function supabaseNotificationRepository(
  admin: SupabaseClient | null,
  session: SupabaseClient,
): NotificationRepository {
  return {
    async notifyMatches(userId) {
      if (!admin) return failed;
      const res = await attempt(() => admin.rpc(RPC.notify, { p_user_id: userId }));
      return res && !res.error ? ok(undefined) : failed;
    },

    async insertWelcome(userId, message, metadata) {
      if (!admin) return;
      const existing = await attempt(() =>
        admin
          .from(TABLE.notifications)
          .select("id")
          .eq("user_id", userId)
          .eq("type", "welcome")
          .maybeSingle(),
      );
      if (existing && !existing.error && existing.data) return;
      await attempt(() =>
        admin.from(TABLE.notifications).insert({
          user_id: userId,
          type: "welcome",
          title: message.title,
          body: message.body,
          metadata,
        }),
      );
    },

    async listMine(unreadOnly): Promise<Result<NotificationRecord[], StorageError>> {
      const res = await attempt(() => session.rpc(RPC.myNotifications, { p_unread_only: unreadOnly }));
      if (!res || res.error) return failed;
      const rows = z.array(notificationSchema).safeParse(res.data ?? []);
      return rows.success ? ok(rows.data) : failed;
    },

    async markRead(ids) {
      const res = await attempt(() => session.rpc(RPC.markRead, { p_ids: [...ids] }));
      if (!res || res.error) return failed;
      return ok(typeof res.data === "number" ? res.data : 0);
    },
  };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function supabaseAdminRepository(session: SupabaseClient): AdminRepository {
  return {
    async isAdmin(userId) {
      const res = await attempt(() =>
        session
          .from(TABLE.roles)
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      );
      return Boolean(res && !res.error && res.data?.role === "admin");
    },

    async loadDashboard(thresholds) {
      const res = await attempt(() =>
        session.rpc(RPC.dashboard, {
          p_romance_threshold: thresholds.romance,
          p_amistad_threshold: thresholds.amistad,
        }),
      );
      return res && !res.error ? ok(res.data as unknown) : failed;
    },
  };
}
