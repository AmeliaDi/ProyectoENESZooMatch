/**
 * Turns a submission into a scored profile:
 *  - `latent`: Bayesian GRM posterior (θ̂, SE, quality) — the ONLY input of
 *    the compatibility score. Computed by an injected scorer so the domain
 *    never loads the 110 KB measurement parameters itself.
 *  - `normalizedScores` + track vectors: descriptive [0, 1] summaries over the
 *    30 legacy dimensions, still used by identity (animal/alias) and the
 *    explanation breakdown. They do not enter the score.
 *  - `mbtiCode`: sign of the continuous latent axes (display only).
 */
import { mbtiFromLatent } from "@/domain/psychometrics/derived";
import type { LatentResponse } from "@/domain/psychometrics/latent";
import type { LatentProfile } from "@/types/latent";
import {
  ALL_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
  type Dimension,
  type DimensionScores,
  type HardFilters,
  type LikertValue,
  type QuizItem,
  type QuizSubmission,
  type ScoredProfile,
} from "@/types/microtest";

const LIKERT_MIN = 1;
const LIKERT_MAX = 5;
const LIKERT_REVERSE_PIVOT = LIKERT_MIN + LIKERT_MAX;
/** Descriptive score of a dimension with no contributing items. */
const NEUTRAL_SCORE = 0.5;

/** Port: scores Likert responses (presentation order) into a latent profile. */
export type LatentScorer = (responses: readonly LatentResponse[]) => LatentProfile;

function emptyScores(): DimensionScores {
  return Object.fromEntries(ALL_DIMENSIONS.map((dimension) => [dimension, 0])) as DimensionScores;
}

function isMandatoryLikert(item: QuizItem): boolean {
  return item.modulo === "nucleo" && !item.banderas.includes("SENS");
}

function descriptiveScores(raw: DimensionScores, counts: DimensionScores): DimensionScores {
  const normalized = emptyScores();
  for (const dimension of ALL_DIMENSIONS) {
    const count = counts[dimension];
    normalized[dimension] =
      count === 0
        ? NEUTRAL_SCORE
        : Math.min(1, Math.max(0, (raw[dimension] - count * LIKERT_MIN) / (count * (LIKERT_MAX - LIKERT_MIN))));
  }
  return normalized;
}

function hardFiltersOf(items: readonly QuizItem[], answers: QuizSubmission): HardFilters {
  const selected = new Map(answers.filters.map((filter) => [filter.itemId, filter.selected]));
  const filters: HardFilters = { orientacion_sexual: [], identidad_genero: [], tipo_relacion_busca: [] };
  for (const item of items) {
    if (item.filtro_duro && item.campo_perfil !== undefined) filters[item.campo_perfil] = [...(selected.get(item.id) ?? [])];
  }
  return filters;
}

/**
 * Optional-module and sensitive (`SENS`) items may be absent: they are
 * skipped, never imputed (ADR-016); the latent posterior simply stays wider.
 * @throws If a mandatory core Likert item is missing.
 */
export function scoreQuiz(answers: QuizSubmission, items: readonly QuizItem[], latent: LatentScorer): ScoredProfile {
  const likert = new Map<string, LikertValue>(answers.likert.map((a) => [a.itemId, a.value]));
  const raw = emptyScores();
  const counts = emptyScores();
  const responses: LatentResponse[] = [];

  for (const item of items) {
    if (item.tipo_respuesta !== "likert_5") continue;
    const value = likert.get(item.id);
    if (value === undefined) {
      if (isMandatoryLikert(item)) throw new Error(`Incomplete quiz: missing answer for item "${item.id}"`);
      continue;
    }
    responses.push({ itemId: item.id, value });
    for (const [dimension, weight] of Object.entries(item.pesos) as Array<[Dimension, 1 | -1]>) {
      raw[dimension] += weight === -1 ? LIKERT_REVERSE_PIVOT - value : value;
      counts[dimension] += 1;
    }
  }

  const normalizedScores = descriptiveScores(raw, counts);
  const latentProfile = latent(responses);
  return {
    rawScores: raw,
    normalizedScores,
    mbtiCode: mbtiFromLatent(latentProfile, 0).code,
    hardFilters: hardFiltersOf(items, answers),
    romanceVector: ROMANCE_VECTOR_DIMENSIONS.map((d) => normalizedScores[d]),
    friendshipVector: FRIENDSHIP_VECTOR_DIMENSIONS.map((d) => normalizedScores[d]),
    latent: latentProfile,
  };
}
