/**
 * Synthetic population for calibration and validation. Every person is drawn
 * from the SAME latent prior θ ~ N(0, R); subpopulations differ only in what
 * the product sees (declared filters, completed modules, response style), so
 * any coverage gap between them is an artefact of the pipeline, not of traits.
 */
import { QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import type { Random } from "@/domain/shared";
import { buildMeasurementModel, scoreLatent, type LatentResponse } from "@/domain/psychometrics/latent";
import { drawTheta, priorFactor, simulateResponses } from "@/domain/psychometrics/simulate";
import type { LatentProfile } from "@/types/latent";
import type { QualityConfig } from "@/types/matching-config";
import type { HardFilters } from "@/types/microtest";

export const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
export const LOWER = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz.map((r) => [...r]));

const LIKERT = QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5");
export const CORE_IDS = LIKERT.filter((i) => i.modulo === "nucleo").map((i) => i.id);
export const ALL_IDS = LIKERT.map((i) => i.id);

export interface Subpopulation {
  readonly id: string;
  readonly filters: (random: Random) => HardFilters;
  /** Share of people who complete every optional module. */
  readonly fullBank: number;
  /** Share answering carelessly (uniform random responses). */
  readonly careless: number;
}

const pick = <T>(random: Random, xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
const BONDS = ["monogamia", "no_monogamia_etica", "sin_definir"] as const;
const ALL_GENDERS = ["mujeres", "hombres", "personas no binarias"];
const declared = (orientation: string[], identity: string) => (r: Random): HardFilters => ({
  orientacion_sexual: orientation,
  identidad_genero: [identity],
  tipo_relacion_busca: [pick(r, BONDS)],
});

export const SUBPOPULATIONS: readonly Subpopulation[] = [
  { id: "mujer_hombres", fullBank: 0.5, careless: 0.03, filters: declared(["hombres"], "mujer") },
  { id: "hombre_mujeres", fullBank: 0.5, careless: 0.03, filters: declared(["mujeres"], "hombre") },
  { id: "mujer_mujeres", fullBank: 0.5, careless: 0.03, filters: declared(["mujeres"], "mujer") },
  { id: "hombre_hombres", fullBank: 0.5, careless: 0.03, filters: declared(["hombres"], "hombre") },
  { id: "nobinarie_todes", fullBank: 0.5, careless: 0.03, filters: declared(ALL_GENDERS, "no binarie") },
  { id: "bi_mujer", fullBank: 0.5, careless: 0.03, filters: declared(["mujeres", "hombres"], "mujer") },
  {
    id: "solo_nucleo",
    fullBank: 0,
    careless: 0.03,
    filters: (r) => ({ orientacion_sexual: ALL_GENDERS, identidad_genero: [pick(r, ["mujer", "hombre", "no binarie"])], tipo_relacion_busca: ["sin_definir"] }),
  },
  {
    id: "prefiere_no_decir",
    fullBank: 0.5,
    careless: 0.03,
    filters: () => ({ orientacion_sexual: ["prefiero no decir"], identidad_genero: ["prefiero no decir"], tipo_relacion_busca: ["prefiero no decir"] }),
  },
];

export interface Person {
  readonly id: string;
  readonly group: string;
  readonly theta: readonly number[];
  readonly responses: readonly LatentResponse[];
  readonly latent: LatentProfile;
  readonly filters: HardFilters;
}

function carelessResponses(ids: readonly string[], random: Random): LatentResponse[] {
  return ids.map((itemId) => ({ itemId, value: 1 + Math.floor(random() * 5) }));
}

export function makePopulation(size: number, random: Random, quality: QualityConfig): Person[] {
  return Array.from({ length: size }, (_, i) => {
    const group = SUBPOPULATIONS[i % SUBPOPULATIONS.length]!;
    const theta = drawTheta(LOWER, random);
    const ids = random() < group.fullBank ? ALL_IDS : CORE_IDS;
    const responses = random() < group.careless ? carelessResponses(ids, random) : simulateResponses(MODEL, ids, theta, random);
    return {
      id: `p${String(i).padStart(4, "0")}`,
      group: group.id,
      theta,
      responses,
      latent: scoreLatent(MODEL, responses, quality),
      filters: group.filters(random),
    };
  });
}

/** ±1 Likert on a share of items, clamped to 1..5. Same random draw order as the latent re-score. */
export function perturbedResponses(person: Person, share: number, random: Random): LatentResponse[] {
  return person.responses.map((r) =>
    random() < share ? { ...r, value: Math.min(5, Math.max(1, r.value + (random() < 0.5 ? -1 : 1))) } : r,
  );
}

/** Re-scores a person after perturbing ±1 Likert in a share of items (clamped to 1..5). */
export function perturbed(person: Person, share: number, random: Random, quality: QualityConfig): LatentProfile {
  return scoreLatent(MODEL, perturbedResponses(person, share, random), quality);
}

/** The person's TRUE latent position as a zero-uncertainty profile (generator oracle). */
export function oracle(person: Person): LatentProfile {
  const theta: Record<string, number> = {};
  const se: Record<string, number> = {};
  MODEL.factors.forEach((f, k) => {
    theta[f] = person.theta[k]!;
    se[f] = 0;
  });
  return { theta, se, quality: 1, answered: person.responses.length };
}
