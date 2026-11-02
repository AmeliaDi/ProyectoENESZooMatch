/**
 * Shared test fixtures for the matching domain (imported only by *.test.ts).
 */
import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LatentProfile } from "@/types/latent";
import type { HardFilters, LikertValue, QuizSubmission, ScoredProfile } from "@/types/microtest";

import type { LatentScorer } from "./score-quiz";

export const TEST_MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
export const testLatentScorer: LatentScorer = (responses) =>
  scoreLatent(TEST_MODEL, responses, MATCHING_CONFIG.quality);

export const LIKERT_ITEMS = QUIZ_ITEMS.filter((item) => item.tipo_respuesta === "likert_5");
export const FILTER_ITEMS = QUIZ_ITEMS.filter((item) => item.tipo_respuesta === "seleccion_multiple");

const DEFAULT_FILTERS: Record<string, string[]> = {
  FIL1: ["mujeres"],
  FIL2: ["no binarie"],
  FIL3: ["monogamia"],
};

export function buildSubmission(
  value: LikertValue = 3,
  overrides: Partial<Record<string, LikertValue>> = {},
  filters: Record<string, string[]> = DEFAULT_FILTERS,
): QuizSubmission {
  return {
    likert: LIKERT_ITEMS.map((item) => ({ itemId: item.id, value: overrides[item.id] ?? value })),
    filters: FILTER_ITEMS.map((item) => ({ itemId: item.id, selected: filters[item.id] ?? [] })),
  };
}

export function hardFilters(overrides: Partial<HardFilters> = {}): HardFilters {
  return { orientacion_sexual: ["mujeres"], identidad_genero: ["mujer"], tipo_relacion_busca: ["monogamia"], ...overrides };
}

/** Latent profile with every factor at `theta` and the same posterior SD. */
export function flatLatent(theta: Record<string, number> = {}, se = 0.3): LatentProfile {
  const factors = TEST_MODEL.factors;
  return {
    theta: Object.fromEntries(factors.map((f) => [f, theta[f] ?? 0])),
    se: Object.fromEntries(factors.map((f) => [f, se])),
    quality: 1,
    answered: LIKERT_ITEMS.length,
  };
}

export function makeProfile(latent: LatentProfile, filters: HardFilters = hardFilters()): ScoredProfile {
  const empty = {} as ScoredProfile["normalizedScores"];
  return {
    rawScores: empty,
    normalizedScores: empty,
    mbtiCode: "INFP",
    hardFilters: filters,
    romanceVector: [],
    friendshipVector: [],
    latent,
  };
}
