import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { factorEffectiveWeights, pairScore } from "@/domain/matching/pair-score";
import { mulberry32 } from "@/domain/shared/random";

import { buildMeasurementModel, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

const BAND =
  MATCHING_CONFIG.tracks.romance.reference_high - MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive;

const REPS = 120;
const THRESHOLD = MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive;

/** Ítems que el modelo de medición conoce, agrupados por factor. */
function itemsByFactor(source?: readonly string[]): Map<string, string[]> {
  const known = new Set(Object.keys(PSYCHOMETRIC_PARAMS.items));
  const ids = source ? new Set(source) : null;
  const map = new Map<string, string[]>();
  for (const item of QUIZ_ITEMS) {
    if (!item.factor || !known.has(item.id)) continue;
    if (ids && !ids.has(item.id)) continue;
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

  /**
   * Techo por camino de entrega, medido con sorteo fijo. Antes de ADR-044 el
   * núcleo obligatorio llegaba a 0,30× la banda, con 4/120 retests de ruido ≥ 1
   * banda y 5/120 cruces del umbral. ADR-044 sacó los ítems de peso 0 y duplicó
   * `meta_crianza`, `meta_carrera` y `val_presente`; ADR-045 duplicó los cuatro
   * valores y los seis intereses que faltaban. Lo que queda de a un ítem en el
   * obligatorio son los 13 del MBTI y el eneagrama — 0,65 % del puntaje, medidos
   * aquí en 0,22× la banda, 1/120 retests sobre una banda y ningún cruce del
   * umbral. En el banco completo el ruido por retest es 0,05× la banda y queda
   * 1 cruce en 120, porque los 19 factores únicos se diluyen entre 194 ítems.
   * `floor` es el piso del arnés: si el promedio cae de ahí, la prueba dejó de
   * medir algo, no es que el instrumento haya mejorado.
   */
  const CEILINGS = {
    nucleo: { ratio: 0.25, overBand: 1, flips: 0, floor: 0.005 },
    "banco completo": { ratio: 0.1, overBand: 0, flips: 1, floor: 0.001 },
  } as const;

  it("el ruido de los items unicos queda por debajo de su techo por camino", () => {
    const cases = [
      ["nucleo", QUIZ_ITEMS.filter((i) => i.modulo === "nucleo")],
      ["banco completo", QUIZ_ITEMS],
    ] as const;
    for (const [label, items] of cases) {
      const answered = items.filter((i) => model.items.has(i.id)).map((i) => i.id);
      // Un factor es "de un solo ítem" dentro de este camino: el banco puede
      // tener más, pero quien solo hace el núcleo contesta una pregunta de él.
      const single = new Set(
        [...itemsByFactor(answered).entries()].filter(([, ids]) => ids.length === 1).map(([f]) => f),
      );
      const factorOf = new Map(items.map((i) => [i.id, i.factor]));
      const noisy = answered.filter((id) => single.has(factorOf.get(id) ?? ""));
      expect(noisy.length).toBeGreaterThan(0);
      const ceiling = CEILINGS[label as keyof typeof CEILINGS];
      const { mean, overBand, flips } = run(label, answered, noisy, model, lower);
      // Un factor de un solo item no puede sostener un discurso de compatibilidad
      // si su propio ruido de retest es una fraccion relevante de la banda util.
      expect(mean, `${label}: el arnés sigue moviendo el puntaje`).toBeGreaterThan(ceiling.floor);
      expect(mean / BAND, `${label}: media/banda`).toBeLessThanOrEqual(ceiling.ratio);
      expect(overBand, label).toBeLessThanOrEqual(ceiling.overBand);
      expect(flips, label).toBeLessThanOrEqual(ceiling.flips);
    }
  }, 300_000);
});

/**
 * Deuda fechada del criterio I5: factores que pesan más de 1 % del total y se
 * miden con un solo ítem en todo el banco. `rel_*` se paga en B7-REL (primero
 * decide la evidencia si la capa relacional sigue pesando 0,20). La deuda de
 * `int_*`/`soc_*`/`val_*` quedó pagada en B3 con los segundos ítems de ADR-045,
 * así que la lista de amistad es vacía: agregar un peso nuevo sobre un ítem
 * único rompe esta prueba, y eso es lo que se quiere romper.
 */
const SINGLE_ITEM_DEBT: Readonly<Record<string, readonly string[]>> = {
  romance: ["rel_autonomia", "rel_comunicacion", "rel_espacio", "rel_exclusividad", "rel_expresividad", "rel_frecuencia", "rel_metas"],
  amistad: [],
};

/**
 * Fracción del puntaje que viaja en factores de un solo ítem cuando el perfil
 * está completo. Se registra el techo actual (ADR-045), medido sobre el banco
 * entero: antes de pagar la deuda eran ~0,31 en romance y ~0,35 en amistad.
 */
const SINGLE_ITEM_MASS_CEILING: Readonly<Record<string, number>> = { romance: 0.219, amistad: 0.001 };

describe("criterio I5: ningun factor pesado se mide con un solo item", () => {
  const byFactor = itemsByFactor();
  it.each(Object.entries(MATCHING_CONFIG.tracks))("pista %s", (trackId, track) => {
    const weights = factorEffectiveWeights(track, MATCHING_CONFIG.categories);
    const debt = [...weights]
      .filter(([factor, weight]) => weight > 0.01 && (byFactor.get(factor) ?? []).length < 2)
      .map(([factor]) => factor)
      .sort();
    expect(debt).toEqual([...(SINGLE_ITEM_DEBT[trackId] ?? [])].sort());

    const mass = [...weights]
      .filter(([factor]) => (byFactor.get(factor) ?? []).length < 2)
      .reduce((s, [, weight]) => s + weight, 0);
    expect(mass).toBeLessThanOrEqual(SINGLE_ITEM_MASS_CEILING[trackId] ?? 0);
  });
});

