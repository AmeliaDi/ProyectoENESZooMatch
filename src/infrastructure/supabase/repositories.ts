/**
 * Supabase adapters for the application ports. All table/RPC names live here
 * and nowhere else. Adapters never throw: failures become `storage.failed`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  AdminRepository,
  CounterpartProfile,
  MatchRepository,
  NotificationRecord,
  NotificationRepository,
  OwnProfile,
  PoolProfile,
  ProfileRepository,
  StoredMatch,
} from "@/application/ports";
import type { StorageError } from "@/application/errors";
import { err, ok, type Result } from "@/domain/shared";
import { ALL_DIMENSIONS } from "@/types/microtest";
import type { DimensionScores, ScoredProfile } from "@/types/microtest";

/** Every table and RPC name the app uses; mirrored by the base migration. */
export const TABLE = {
  profiles: "profiles",
  notifications: "notifications",
  roles: "user_roles",
} as const;
export const RPC = {
  submit: "submit_quiz_result",
  poolVersion: "get_pool_version",
  replace: "replace_matches",
  userMatches: "get_user_matches",
  notify: "notify_matches",
  dashboard: "get_admin_dashboard",
  myNotifications: "get_my_notifications",
  markRead: "mark_notifications_read",
} as const;

const PROFILE_PAGE_SIZE = 1000;
/** Neutral score for a dimension missing from a stored profile. */
const NEUTRAL_SCORE = 0.5;
/** Placeholder MBTI when a legacy row has none; it does not affect vectors. */
const FALLBACK_MBTI = "ENTJ";
/** `replace_matches` returns this sentinel when the completed pool changed. */
const POOL_CHANGED_SENTINEL = -1;

const failed = err<StorageError>("storage.failed");

async function attempt<T>(run: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

function firstJoined(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

const latentSchema = z
  .object({
    theta: z.record(z.string(), z.number()),
    se: z.record(z.string(), z.number().nonnegative()),
    quality: z.number().min(0).max(1),
    answered: z.number().int().nonnegative(),
  })
  .nullable()
  .catch(null);

const poolRowSchema = z.object({
  user_id: z.string(),
  romance_vector: z.array(z.number()),
  amistad_vector: z.array(z.number()),
  dimension_scores: z.record(z.string(), z.number()).nullable(),
  orientacion_sexual: z.array(z.string()).nullable(),
  identidad_genero: z.array(z.string()).nullable(),
  tipo_relacion_busca: z.array(z.string()).nullable(),
  mbti_code: z.string().nullable(),
  latent_profile: latentSchema,
});

/** A row without a latent profile keeps the population prior (θ = 0, SE = 1). */
const priorLatent = () => ({ theta: {}, se: {}, quality: 1, answered: 0 });

function toScoredProfile(row: z.infer<typeof poolRowSchema>): ScoredProfile {
  const scores = Object.fromEntries(
    ALL_DIMENSIONS.map((d) => [d, row.dimension_scores?.[d] ?? NEUTRAL_SCORE]),
  ) as DimensionScores;
  return {
    rawScores: scores,
    normalizedScores: scores,
    mbtiCode: row.mbti_code ?? FALLBACK_MBTI,
    hardFilters: {
      orientacion_sexual: row.orientacion_sexual ?? [],
      identidad_genero: row.identidad_genero ?? [],
      tipo_relacion_busca: row.tipo_relacion_busca ?? [],
    },
    romanceVector: row.romance_vector,
    friendshipVector: row.amistad_vector,
    latent: row.latent_profile ?? priorLatent(),
  };
}

function toOwnProfile(row: Record<string, unknown>): OwnProfile {
  const animal = firstJoined(row.animals);
  const color = firstJoined(row.colors);
  return {
    alias: String(row.alias ?? ""),
    narrative: String(row.narrative ?? ""),
    mbtiCode: (row.mbti_code as string | null) ?? null,
    dimensionScores: (row.dimension_scores as Record<string, number> | null) ?? null,
    romanceVector: (row.romance_vector as number[] | null) ?? null,
    amistadVector: (row.amistad_vector as number[] | null) ?? null,
    animal: animal as OwnProfile["animal"],
    color: color as OwnProfile["color"],
    mark: toMark(row.avatar_mark),
    latent: latentSchema.parse(row.latent_profile ?? null),
  };
}

function toCounterpart(row: Record<string, unknown>): CounterpartProfile {
  return {
    userId: String(row.user_id),
    dimensionScores: (row.dimension_scores as Record<string, number> | null) ?? null,
    mbtiCode: (row.mbti_code as string | null) ?? null,
    romanceVector: (row.romance_vector as number[] | null) ?? null,
    amistadVector: (row.amistad_vector as number[] | null) ?? null,
    animalId: (row.animal_id as string | null) ?? null,
    colorId: (row.color_id as string | null) ?? null,
    mark: toMark(row.avatar_mark),
    showAvatarDetail: row.show_avatar_detail === true,
  };
}

function toMark(value: unknown): "sp" | "so" | "sx" | null {
  return value === "sp" || value === "so" || value === "sx" ? value : null;
}

/**
 * Participant tables are invisible to API roles, so every read and write uses
 * the service-role client. Callers must have verified the session first.
 */
export function supabaseProfileRepository(admin: SupabaseClient): ProfileRepository {
  return {
    async isQuizCompleted(userId) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select("quiz_completed_at").eq("user_id", userId).maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok(Boolean(res.data?.quiz_completed_at));
    },

    async privacyState(userId) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select("paused_at, show_avatar_detail").eq("user_id", userId).maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok({ paused: Boolean(res.data?.paused_at), showAvatarDetail: res.data?.show_avatar_detail === true });
    },

    async setShowAvatarDetail(userId, show) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).update({ show_avatar_detail: show }).eq("user_id", userId),
      );
      return res && !res.error ? ok(undefined) : failed;
    },

    async setPaused(userId, paused) {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .update({ paused_at: paused ? new Date().toISOString() : null })
          .eq("user_id", userId),
      );
      return res && !res.error ? ok(undefined) : failed;
    },

    async deleteAccount(userId) {
      const res = await attempt(() => admin.auth.admin.deleteUser(userId));
      return res && !res.error ? ok(undefined) : failed;
    },

    async saveQuizResult({ userId, answers, scored, identity }) {
      const res = await attempt(() =>
        admin.rpc(RPC.submit, {
          p_user_id: userId,
          p_answers: answers,
          p_dimension_scores: scored.normalizedScores,
          p_romance_vector: scored.romanceVector,
          p_amistad_vector: scored.friendshipVector,
          p_mbti_code: scored.mbtiCode,
          p_hard_filters: scored.hardFilters,
          p_animal_id: identity.animalId,
          p_color_id: identity.colorId,
          p_narrative: identity.narrative,
          p_alias: identity.alias,
          p_latent_profile: scored.latent,
          p_avatar_mark: identity.mark,
        }),
      );
      return res && !res.error ? ok(undefined) : failed;
    },

    async setInclusiveMode(userId, mode) {
      await attempt(() =>
        admin.from(TABLE.profiles).update({ inclusive_mode: mode }).eq("user_id", userId),
      );
    },

    async loadCompletedPool() {
      const pool: PoolProfile[] = [];
      for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
        const res = await attempt(() =>
          admin
            .from(TABLE.profiles)
            .select(
              "user_id, romance_vector, amistad_vector, dimension_scores, orientacion_sexual, identidad_genero, tipo_relacion_busca, mbti_code, latent_profile",
            )
            .not("quiz_completed_at", "is", null)
            .is("paused_at", null)
            .order("user_id")
            .range(from, from + PROFILE_PAGE_SIZE - 1),
        );
        if (!res || res.error || !res.data) return failed;
        const rows = z.array(poolRowSchema).safeParse(res.data);
        if (!rows.success) return failed;
        pool.push(...rows.data.map((row) => ({ userId: row.user_id, profile: toScoredProfile(row) })));
        if (res.data.length < PROFILE_PAGE_SIZE) return ok(pool);
      }
    },

    async countActive() {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .select("user_id", { count: "exact", head: true })
          .not("quiz_completed_at", "is", null)
          .is("paused_at", null),
      );
      return res && !res.error && typeof res.count === "number" ? res.count : null;
    },

    async findOwn(userId) {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .select(
            "alias, narrative, mbti_code, dimension_scores, romance_vector, amistad_vector, avatar_mark, latent_profile, animals(id, diminutivo_es, categoria_fauna), colors(id, nombre, hex)",
          )
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok(res.data ? toOwnProfile(res.data as Record<string, unknown>) : null);
    },

    async findCounterparts(userIds) {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .select(
            "user_id, dimension_scores, mbti_code, romance_vector, amistad_vector, animal_id, color_id, avatar_mark, show_avatar_detail",
          )
          .in("user_id", [...userIds]),
      );
      if (!res || res.error || !res.data) return [];
      return (res.data as Array<Record<string, unknown>>).map(toCounterpart);
    },
  };
}

// ─── Matches ─────────────────────────────────────────────────────────────────

const matchRowSchema = z.object({
  track: z.enum(["romance", "amistad"]),
  other_user: z.string().nullable().optional(),
  other_alias: z.string().nullable().optional(),
  other_animal: z.string().nullable().optional(),
  other_color: z.string().nullable().optional(),
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
      const res = await attempt(() =>
        admin.rpc(RPC.replace, {
          p_matches: pairs.map((pair) => ({
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
          otherAlias: row.other_alias ?? null,
          otherAnimal: row.other_animal ?? null,
          otherColor: row.other_color ?? null,
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
