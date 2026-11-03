/**
 * Supabase adapter of `ProfileRepository`. Participant tables are invisible
 * to API roles, so every read and write uses the service-role client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { CounterpartProfile, OwnProfile, PoolProfile, ProfileRepository } from "@/application/ports";
import { ok } from "@/domain/shared";
import { ALL_DIMENSIONS, QUIZ_MODULE_IDS } from "@/types/microtest";
import { isShareLayer, type ShareLayerId } from "@/types/sharing";
import type { DimensionScores, ScoredProfile } from "@/types/microtest";

import { FALLBACK_MBTI, NEUTRAL_SCORE, PROFILE_PAGE_SIZE, RPC, TABLE, attempt, failed, firstJoined } from "./shared";


const latentSchema = z
  .object({
    theta: z.record(z.string(), z.number()),
    se: z.record(z.string(), z.number().nonnegative()),
    quality: z.number().min(0).max(1),
    answered: z.number().int().nonnegative(),
  })
  .nullable()
  .catch(null);

const modulesSchema = z.array(z.enum(QUIZ_MODULE_IDS)).catch([]);

/** Unknown values are dropped, never shown: sharing fails closed. */
function toSharedLayers(value: unknown): ShareLayerId[] {
  return Array.isArray(value) ? value.filter(isShareLayer) : [];
}

const answerRowSchema = z.object({
  item_id: z.string(),
  likert_value: z.number().int().min(1).max(5).nullable(),
  selected_options: z.array(z.string()).nullable(),
});

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
    animal: animal as OwnProfile["animal"],
    color: color as OwnProfile["color"],
    mark: toMark(row.avatar_mark),
    latent: latentSchema.parse(row.latent_profile ?? null),
    completedModules: modulesSchema.parse(row.completed_modules ?? []),
  };
}

function toCounterpart(row: Record<string, unknown>): CounterpartProfile {
  return {
    userId: String(row.user_id),
    mbtiCode: (row.mbti_code as string | null) ?? null,
    latent: latentSchema.parse(row.latent_profile ?? null),
    animalId: (row.animal_id as string | null) ?? null,
    colorId: (row.color_id as string | null) ?? null,
    mark: toMark(row.avatar_mark),
    showAvatarDetail: row.show_avatar_detail === true,
    sharedLayers: toSharedLayers(row.shared_layers),
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
        admin.from(TABLE.profiles).select("paused_at, show_avatar_detail, shared_layers").eq("user_id", userId).maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok({
        paused: Boolean(res.data?.paused_at),
        showAvatarDetail: res.data?.show_avatar_detail === true,
        sharedLayers: toSharedLayers(res.data?.shared_layers),
      });
    },

    async setSharedLayers(userId, layers) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).update({ shared_layers: [...layers] }).eq("user_id", userId),
      );
      return res && !res.error ? ok(undefined) : failed;
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

    async saveQuizResult({ userId, answers, scored, identity, completedModules }) {
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
          p_completed_modules: completedModules,
        }),
      );
      if (!res || res.error) return failed;
      return ok({ alias: typeof res.data === "string" ? res.data : identity.alias });
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
            "alias, narrative, mbti_code, avatar_mark, latent_profile, completed_modules, animals(id, diminutivo_es, categoria_fauna), colors(id, nombre, hex)",
          )
          .eq("user_id", userId)
          .maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok(res.data ? toOwnProfile(res.data as Record<string, unknown>) : null);
    },

    async loadAnswers(userId) {
      const res = await attempt(() =>
        admin.from(TABLE.responses).select("item_id, likert_value, selected_options").eq("user_id", userId),
      );
      if (!res || res.error) return failed;
      const rows = z.array(answerRowSchema).safeParse(res.data ?? []);
      if (!rows.success) return failed;
      return ok(
        rows.data.map((row) =>
          row.selected_options !== null
            ? { itemId: row.item_id, selected: row.selected_options }
            : { itemId: row.item_id, value: row.likert_value ?? 0 },
        ),
      );
    },

    async findCounterparts(userIds) {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .select(
            "user_id, mbti_code, latent_profile, animal_id, color_id, avatar_mark, show_avatar_detail, shared_layers",
          )
          .in("user_id", [...userIds]),
      );
      if (!res || res.error || !res.data) return [];
      return (res.data as Array<Record<string, unknown>>).map(toCounterpart);
    },
  };
}
