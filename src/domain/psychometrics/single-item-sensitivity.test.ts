import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { pairScore } from "@/domain/matching/pair-score";
import { mulberry32 } from "@/domain/shared/random";

import { buildMeasurementModel, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

const BAND =
  MATCHING_CONFIG.tracks.romance.reference_high - MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive;

const REPS = 120;
const THRESHOLD = MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive;

/** Ítems que el modelo de medición conoce, agrupados por factor. */
function itemsByFactor(): Map<string, string[]> {
  const known = new Set(Object.keys(PSYCHOMETRIC_PARAMS.items));
  const map = new Map<string, string[]>();
  for (const item of QUIZ_ITEMS) {
    if (!item.factor || !known.has(item.id)) continue;
    const list = map.get(item.factor) ?? [];
    list.push(item.id);
    map.set(item.factor, list);
  }
  return map;
}

function run(label: string, answered: string[], noisy: string[], model: ReturnType<typeof buildMeasurementModel>, lower: number[][]) {
  const noisySet = new Set(noisy);
  const stable = answered.filter((id) => !noisySet.has(id));

  let sum = 0;
  let max = 0;
  let overBand = 0;
  let flips = 0;
  const quantiles: number[] = [];

  for (let r = 0; r < REPS; r += 1) {
    // La misma persona latente, dos sesiones: solo cambian las respuestas.
    const truthA = drawTheta(lower, mulberry32(210000 + r));
    const truthB = drawTheta(lower, mulberry32(410000 + r));

    const responsesA = [...simulateResponses(model, stable, truthA, mulberry32(310000 + r)), ...simulateResponses(model, noisy, truthA, mulberry32(610000 + r))];
    const responsesB = [...simulateResponses(model, stable, truthB, mulberry32(510000 + r)), ...simulateResponses(model, noisy, truthB, mulberry32(710000 + r))];
    // Réplica 2: mismo θ, mismo set estable, distinto sorteo en los ítems únicos.
    const againA = [...responsesA.filter((x) => !noisySet.has(x.itemId)), ...simulateResponses(model, noisy, truthA, mulberry32(810000 + r))];
    const againB = [...responsesB.filter((x) => !noisySet.has(x.itemId)), ...simulateResponses(model, noisy, truthB, mulberry32(910000 + r))];

    const total = (a: typeof responsesA, b: typeof responsesB) =>
      pairScore(
        scoreLatent(model, a, MATCHING_CONFIG.quality),
        scoreLatent(model, b, MATCHING_CONFIG.quality),
        MATCHING_CONFIG.tracks.romance,
        MATCHING_CONFIG.categories,
      ).total;

    const d = Math.abs(total(responsesA, responsesB) - total(againA, againB));
    sum += d;
    max = Math.max(max, d);
    if (d >= BAND) overBand += 1;
    if (total(responsesA, responsesB) >= THRESHOLD !== total(againA, againB) >= THRESHOLD) flips += 1;
    quantiles.push(d);
  }

  quantiles.sort((x, y) => x - y);
  const q = (p: number) => quantiles[Math.floor(p * (REPS - 1))]!.toFixed(4);
  console.log(
    `${label} — ${answered.length} items contestados, ${noisy.length} de factor unico (${((noisy.length / answered.length) * 100).toFixed(0)}% del test).\n` +
      `  |delta total| por retest: medio ${(sum / REPS).toFixed(4)}  p50 ${q(0.5)}  p90 ${q(0.9)}  maximo ${max.toFixed(4)}\n` +
      `  banda util (umbral -> reference_high) = ${BAND.toFixed(4)};  media/banda = ${((sum / REPS) / BAND).toFixed(2)}x\n` +
      `  retests con ruido >= 1 banda: ${overBand}/${REPS}   |   retests que cruzan el umbral: ${flips}/${REPS}`,
  );
  return { mean: sum / REPS, max, overBand, flips };
}

describe("ruido de los factores de un solo item", () => {
  const model = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  const lower = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz);
  const byFactor = itemsByFactor();
  const single = new Set([...byFactor].filter(([, ids]) => ids.length === 1).map(([f]) => f));

  it("el retest de los items unicos llena la banda util del umbral", () => {
    const factorOf = new Map(QUIZ_ITEMS.map((i) => [i.id, i.factor]));
    const cases = [
      ["nucleo", QUIZ_ITEMS.filter((i) => i.modulo === "nucleo")],
      ["banco completo", QUIZ_ITEMS],
    ] as const;
    for (const [label, items] of cases) {
      const answered = items.filter((i) => model.items.has(i.id)).map((i) => i.id);
      const noisy = answered.filter((id) => single.has(factorOf.get(id) ?? ""));
      expect(noisy.length).toBeGreaterThan(0);
      const { mean, overBand } = run(label, answered, noisy, model, lower);
      // Un factor de un solo item no puede sostener un discurso de compatibilidad
      // si su propio ruido de retest es una fraccion relevante de la banda util.
      expect(mean).toBeGreaterThan(0.005);
      expect(overBand).toBeGreaterThan(0);
    }
  }, 300_000);
});
