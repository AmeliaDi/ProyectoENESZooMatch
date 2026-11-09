import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { factorEffectiveWeights } from "@/domain/matching/pair-score";

import { buildMeasurementModel } from "./latent";
import {
  itemsByFactor,
  measureRetest,
  retestPriorFactor,
  singleItemIds,
} from "./retest-noise";

describe("ruido de los factores de un solo item", () => {
  const model = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
  const lower = retestPriorFactor();

  /**
   * Techo por camino de entrega, medido con sorteo fijo. Antes de ADR-044 el
   * núcleo obligatorio llegaba a 0,30× la banda, con 4/120 retests de ruido ≥ 1
   * banda y 5/120 cruces del umbral. ADR-044 sacó los ítems de peso 0 y duplicó
   * `meta_crianza`, `meta_carrera` y `val_presente`; ADR-045 duplicó los cuatro
   * valores y los seis intereses que faltaban. Lo que queda de a un ítem en el
   * obligatorio son los 13 del MBTI y el eneagrama — 0,65 % del puntaje, medidos
   * aquí en 0,20× la banda, 1/120 retests sobre una banda y ningún cruce del
   * umbral. En el banco completo el ruido por retest es 0,03× la banda y no
   * cruza el umbral en ninguno de los 120 sorteos.
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
      const noisy = singleItemIds(answered);
      expect(noisy.length).toBeGreaterThan(0);
      const ceiling = CEILINGS[label as keyof typeof CEILINGS];
      const sample = measureRetest(label, answered, noisy, model, lower);
      console.log(
        `${sample.label} — ${sample.answered} items contestados, ${sample.singleItems} de factor unico ` +
          `(${(sample.singleShare * 100).toFixed(0)}% del test).\n` +
          `  |delta total| por retest: medio ${sample.mean.toFixed(4)}  p50 ${sample.p50.toFixed(4)}  ` +
          `p90 ${sample.p90.toFixed(4)}  maximo ${sample.max.toFixed(4)}\n` +
          `  banda util (umbral -> reference_high) = ${sample.band.toFixed(4)};  ` +
          `media/banda = ${(sample.mean / sample.band).toFixed(2)}x  p90/banda = ${(sample.p90 / sample.band).toFixed(2)}x\n` +
          `  retests con ruido >= 1 banda: ${sample.overBand}/${sample.reps}   |   ` +
          `retests que cruzan el umbral: ${sample.flips}/${sample.reps}`,
      );
      // Un factor de un solo item no puede sostener un discurso de compatibilidad
      // si su propio ruido de retest es una fraccion relevante de la banda util.
      expect(sample.mean, `${label}: el arnés sigue moviendo el puntaje`).toBeGreaterThan(ceiling.floor);
      expect(sample.mean / sample.band, `${label}: media/banda`).toBeLessThanOrEqual(ceiling.ratio);
      expect(sample.overBand, label).toBeLessThanOrEqual(ceiling.overBand);
      expect(sample.flips, label).toBeLessThanOrEqual(ceiling.flips);
    }
  }, 300_000);
});

/**
 * Deuda fechada del criterio I5: factores que pesan más de 1 % del total y se
 * miden con un solo ítem en todo el banco. Las dos pistas están en cero: la
 * deuda de `int_*`/`soc_*`/`val_*` se pagó en B3 con los segundos ítems de
 * ADR-045, y la de `rel_*` se pagó por el lado del peso (ADR-050: la capa
 * relacional pesa 0, así que sus factores de un ítem ya no mueven el puntaje).
 * Cualquier peso nuevo sobre un ítem único rompe esta prueba, y eso es lo que
 * se quiere impedir.
 */
const SINGLE_ITEM_DEBT: Readonly<Record<string, readonly string[]>> = {
  romance: [],
  amistad: [],
};

/**
 * Fracción del puntaje que viaja en factores de un solo ítem cuando el perfil
 * está completo. Se registra el techo actual (ADR-045), medido sobre el banco
 * entero: antes de pagar la deuda eran ~0,31 en romance y ~0,35 en amistad; con
 * la capa relacional en peso 0 (ADR-050) romance baja a 0,030 y son solo los
 * extras de conflicto y afecto.
 */
const SINGLE_ITEM_MASS_CEILING: Readonly<Record<string, number>> = { romance: 0.031, amistad: 0.001 };

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
