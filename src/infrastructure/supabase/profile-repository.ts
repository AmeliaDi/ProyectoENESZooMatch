/**
 * Supabase adapter of `ProfileRepository`. Participant tables are invisible
 * to API roles, so every read and write uses the service-role client.
 *
 * Identity is only ever read from its columns (`identityState`, `findOwn`,
 * `findCounterparts`) and only ever written through `writeIdentity` /
 * `saveQuizResult`, which call the `hatch_profile_identity` RPC. Nothing here
 * recomputes an animal, a colour or a name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  CounterpartProfile,
  HatchOutcome,
  IdentityRecord,
  OwnProfile,
  PoolProfile,
  ProfileRepository,
} from "@/application/ports";
import { enneagramCodeOf, type HatchedIdentity, type IdentityState } from "@/domain/identity/hatch-identity";
import { ok } from "@/domain/shared";
import { ALL_DIMENSIONS, QUIZ_MODULE_IDS } from "@/types/microtest";
import { isShareLayer, type ShareLayerId } from "@/types/sharing";
import type { DimensionScores, ScoredProfile } from "@/types/microtest";

import {
  FALLBACK_MBTI,
  NEUTRAL_SCORE,
  PROFILE_PAGE_SIZE,
  RPC,
  TABLE,
  attempt,
  failed,
  firstJoined,
} from "./shared";

export const latentSchema = z
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

const IDENTITY_COLUMNS =
  "estado_identidad, alias_completo, alias_animal, alias_color, alias_sufijo, animal_id, color_id, mbti_code, enneagram_code, narrative, avatar_mark, revelacion_vista, quiz_completed_at";

function toState(value: unknown): IdentityState {
  return value === "eclosionado" ? "eclosionado" : "huevo";
}

/** One projection of the identity columns, used by every read. */
function toIdentityRecord(row: Record<string, unknown>): IdentityRecord {
  return {
    estadoIdentidad: toState(row.estado_identidad),
    aliasCompleto: (row.alias_completo as string | null) ?? null,
    aliasAnimal: (row.alias_animal as string | null) ?? null,
    aliasColor: (row.alias_color as string | null) ?? null,
    aliasSufijo: (row.alias_sufijo as string | null) ?? null,
    animalId: (row.animal_id as string | null) ?? null,
    colorId: (row.color_id as string | null) ?? null,
    mbtiCode: (row.mbti_code as string | null) ?? null,
    enneagramCode: (row.enneagram_code as string | null) ?? null,
    narrative: (row.narrative as string | null) ?? null,
    mark: toMark(row.avatar_mark),
    revelacionVista: row.revelacion_vista === true,
    quizCompletedAt: (row.quiz_completed_at as string | null) ?? null,
  };
}

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
  const stored = row.dimension_scores as Record<string, number> | null;
  return {
    identity: toIdentityRecord(row),
    narrative: String(row.narrative ?? ""),
    normalizedScores: stored
      ? (Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, stored[d] ?? NEUTRAL_SCORE])) as DimensionScores)
      : null,
    animal: firstJoined(row.animals) as OwnProfile["animal"],
    color: firstJoined(row.colors) as OwnProfile["color"],
    latent: latentSchema.parse(row.latent_profile ?? null),
    completedModules: modulesSchema.parse(row.completed_modules ?? []),
  };
}

function toCounterpart(row: Record<string, unknown>): CounterpartProfile {
  return {
    userId: String(row.user_id),
    estadoIdentidad: toState(row.estado_identidad),
    aliasCompleto: (row.alias_completo as string | null) ?? null,
    aliasAnimal: (row.alias_animal as string | null) ?? null,
    aliasColor: (row.alias_color as string | null) ?? null,
    aliasSufijo: (row.alias_sufijo as string | null) ?? null,
    mbtiCode: (row.mbti_code as string | null) ?? null,
    enneagramCode: (row.enneagram_code as string | null) ?? null,
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

/** The RPC raises 23505 when the deterministic alias lost a race. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
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

    async identityState(userId) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select(IDENTITY_COLUMNS).eq("user_id", userId).maybeSingle(),
      );
      if (!res || res.error) return failed;
      return ok(res.data ? toIdentityRecord(res.data as Record<string, unknown>) : null);
    },

    async writeIdentity(userId, hatch) {
      const res = await attempt(() =>
        admin.rpc(RPC.hatch, {
          p_user_id: userId,
          p_animal_id: hatch.animalId,
          p_color_id: hatch.colorId,
          p_alias_animal: hatch.aliasAnimal,
          p_alias_color: hatch.aliasColor,
          p_alias_sufijo: hatch.aliasSufijo,
          p_alias_completo: hatch.aliasCompleto,
          p_enneagram_code: enneagramCodeOf(hatch.enneagram),
          p_narrative: hatch.narrative,
          p_avatar_mark: hatch.mark,
        }),
      );
      if (!res) return failed;
      if (res.error) return isUniqueViolation(res.error) ? ok(collision(hatch)) : failed;
      return ok(outcomeOf(hatch, typeof res.data === "string" ? res.data : null));
    },

    async markRevealed(userId) {
      const res = await attempt(() => admin.rpc(RPC.markRevealed, { p_user_id: userId }));
      if (!res || res.error) return failed;
      return ok(res.data === true);
    },

    async listAliases() {
      const aliases: string[] = [];
      for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
        const res = await attempt(() =>
          admin
            .from(TABLE.profiles)
            .select("alias_completo")
            .not("alias_completo", "is", null)
            .order("alias_completo")
            .range(from, from + PROFILE_PAGE_SIZE - 1),
        );
        if (!res || res.error || !res.data) return failed;
        aliases.push(...res.data.map((row) => String(row.alias_completo)));
        if (res.data.length < PROFILE_PAGE_SIZE) return ok(aliases);
      }
    },

    async deleteAccount(userId) {
      const res = await attempt(() => admin.auth.admin.deleteUser(userId));
      return res && !res.error ? ok(undefined) : failed;
    },

    async saveQuizResult({ userId, answers, scored, narrative, hatch, completedModules }) {
      const res = await attempt(() =>
        admin.rpc(RPC.submit, {
          p_user_id: userId,
          p_answers: answers,
          p_dimension_scores: scored.normalizedScores,
          p_romance_vector: scored.romanceVector,
          p_amistad_vector: scored.friendshipVector,
          p_mbti_code: scored.mbtiCode,
          p_hard_filters: scored.hardFilters,
          p_animal_id: hatch?.animalId ?? null,
          p_color_id: hatch?.colorId ?? null,
          p_narrative: narrative,
          p_latent_profile: scored.latent,
          p_avatar_mark: hatch?.mark ?? null,
          p_completed_modules: completedModules,
          p_alias_animal: hatch?.aliasAnimal ?? null,
          p_alias_color: hatch?.aliasColor ?? null,
          p_alias_sufijo: hatch?.aliasSufijo ?? null,
          p_enneagram_code: hatch ? enneagramCodeOf(hatch.enneagram) : null,
        }),
      );
      if (!res) return failed;
      if (res.error) return isUniqueViolation(res.error) ? ok(collision(hatch)) : failed;
      return ok(outcomeOf(hatch, typeof res.data === "string" ? res.data : null));
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
            .eq("estado_identidad", "eclosionado")
            .not("quiz_completed_at", "is", null)
            .is("paused_at", null)
            .is("eliminado_en", null)
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
          .eq("estado_identidad", "eclosionado")
          .not("quiz_completed_at", "is", null)
          .is("paused_at", null)
          .is("eliminado_en", null),
      );
      return res && !res.error && typeof res.count === "number" ? res.count : null;
    },

    async findOwn(userId) {
      const res = await attempt(() =>
        admin
          .from(TABLE.profiles)
          .select(
            `${IDENTITY_COLUMNS}, dimension_scores, completed_modules, latent_profile, animals(id, diminutivo_es, categoria_fauna), colors(id, nombre, hex)`,
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
            "user_id, estado_identidad, alias_completo, alias_animal, alias_color, alias_sufijo, animal_id, color_id, mbti_code, enneagram_code, avatar_mark, latent_profile, show_avatar_detail, shared_layers",
          )
          .in("user_id", [...userIds]),
      );
      if (!res || res.error || !res.data) return [];
      return (res.data as Array<Record<string, unknown>>).map(toCounterpart);
    },
  };
}

/**
 * The RPCs answer with the alias that is stored after the write, so the
 * outcome is a comparison, not a guess: the same text means this run froze
 * it, a different one means the row was already frozen, and nothing means the
 * person is still an egg.
 */
function outcomeOf(hatch: HatchedIdentity | undefined, returned: string | null): HatchOutcome {
  if (!returned) return { outcome: "already", aliasCompleto: "", estadoIdentidad: "huevo" };
  if (hatch && returned === hatch.aliasCompleto) {
    return { outcome: "written", aliasCompleto: returned, estadoIdentidad: "eclosionado" };
  }
  return { outcome: "already", aliasCompleto: returned, estadoIdentidad: "eclosionado" };
}

function collision(hatch: HatchedIdentity | undefined): HatchOutcome {
  return { outcome: "collision", aliasCompleto: hatch?.aliasCompleto ?? "", estadoIdentidad: "huevo" };
}
