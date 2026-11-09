import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { pairScore } from "@/domain/matching/pair-score";
import { mulberry32 } from "@/domain/shared/random";
import type { LatentProfile } from "@/types/latent";

import { buildMeasurementModel, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

const coreHex = QUIZ_ITEMS.filter((i) => i.modulo === "nucleo" && i.factor?.startsWith("hex_")).map((i) => i.id);
const bridge = QUIZ_ITEMS.filter((i) => i.modulo === "puente_big_five").map((i) => i.id);

const PAIRS_BF_HEX: Array<[string, string]> = [
  ["bf_e", "hex_x"],
  ["bf_c", "hex_c"],
  ["bf_o", "hex_o"],
  ["bf_a", "hex_a"],
  ["bf_a", "hex_h"],
  ["bf_n", "hex_e"],
];

function paramsWith(pairs: Array<[string, string, number]>) {
  const m = PSYCHOMETRIC_PARAMS.covarianza_latente.matriz.map((row) => [...row]);
  for (const [a, b, v] of pairs) {
    const i = PSYCHOMETRIC_PARAMS.factores.indexOf(a);
    const j = PSYCHOMETRIC_PARAMS.factores.indexOf(b);
    m[i]![j] = v;
    m[j]![i] = v;
  }
  return { ...PSYCHOMETRIC_PARAMS, covarianza_latente: { matriz: m } };
}

const ZEROED: Array<[string, string, number]> = PAIRS_BF_HEX.map(([a, b]) => [a, b, 0]);
const REPS = 150;
const THRESHOLD = MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive;

function simOf(score: ReturnType<typeof pairScore>, id: string): number {
  return score.categories.find((c) => c.id === id)?.similarity ?? Number.NaN;
}

describe("impacto aguas abajo de los priors del puente", () => {
  it("cambio en s_personalidad y en el total de romance al pasar de r_puente a r=0", () => {
    const modelCfg = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
    const modelZero = buildMeasurementModel(paramsWith(ZEROED));
    const lower = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz);

    let sumDs = 0;
    let maxDs = 0;
    let sumDt = 0;
    let maxDt = 0;
    let flips = 0;
    let aboveThreshold = 0;

    for (let r = 0; r < REPS; r += 1) {
      const truth = drawTheta(lower, mulberry32(1000 + r));
      const truthB = drawTheta(lower, mulberry32(50000 + r));
      const respA = simulateResponses(modelCfg, [...coreHex, ...bridge], truth, mulberry32(9000 + r));
      const respB = simulateResponses(modelCfg, coreHex, truthB, mulberry32(9000 + r));

      const sCfg = pairScore(
        scoreLatent(modelCfg, respA, MATCHING_CONFIG.quality),
        scoreLatent(modelCfg, respB, MATCHING_CONFIG.quality),
        MATCHING_CONFIG.tracks.romance,
        MATCHING_CONFIG.categories,
      );
      const sZero = pairScore(
        scoreLatent(modelZero, respA, MATCHING_CONFIG.quality),
        scoreLatent(modelZero, respB, MATCHING_CONFIG.quality),
        MATCHING_CONFIG.tracks.romance,
        MATCHING_CONFIG.categories,
      );

      const ds = Math.abs(simOf(sCfg, "personalidad") - simOf(sZero, "personalidad"));
      const dt = Math.abs(sCfg.total - sZero.total);
      sumDs += ds;
      sumDt += dt;
      maxDs = Math.max(maxDs, ds);
      maxDt = Math.max(maxDt, dt);
      if (sCfg.total >= THRESHOLD) aboveThreshold += 1;
      if (sCfg.total >= THRESHOLD !== sZero.total >= THRESHOLD) flips += 1;
    }

    console.log(
      `A contesta nucleo+puente (39 items), B solo nucleo (24). ${REPS} pares, semilla fija.\n` +
        `umbral romance = ${THRESHOLD}  |  pares sobre el umbral con config: ${aboveThreshold}\n` +
        `|Δ s_personalidad| medio ${(sumDs / REPS).toFixed(4)}, maximo ${maxDs.toFixed(4)}\n` +
        `|Δ total| medio ${(sumDt / REPS).toFixed(4)}, maximo ${maxDt.toFixed(4)}\n` +
        `pares que cambian de lado del umbral: ${flips}`,
    );
    expect(REPS).toBeGreaterThan(0);
    // El peor caso de |Δ s_personalidad| supera el ancho entre el umbral de
    // romance (0,5374) y reference_high (0,5877): el prior cambia el mensaje.
    expect(maxDs).toBeGreaterThan(0.1);
  }, 90_000);

  it("estabilidad del top-K publicado cuando los priors del puente cambian", () => {
    const modelCfg = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
    const modelZero = buildMeasurementModel(paramsWith(ZEROED));
    const lower = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz);
    const N = 120;
    const K = 3;

    const cfg = { theta: [] as Record<string, number>[], se: [] as Record<string, number>[] };
    const zero = { theta: [] as Record<string, number>[], se: [] as Record<string, number>[] };
    const tookBridge: boolean[] = [];

    for (let p = 0; p < N; p += 1) {
      const truth = drawTheta(lower, mulberry32(700000 + p));
      const usesBridge = p % 2 === 0;
      tookBridge.push(usesBridge);
      const ids = usesBridge ? [...coreHex, ...bridge] : coreHex;
      const responses = simulateResponses(modelCfg, ids, truth, mulberry32(800000 + p));
      const a = scoreLatent(modelCfg, responses, MATCHING_CONFIG.quality);
      const b = scoreLatent(modelZero, responses, MATCHING_CONFIG.quality);
      cfg.theta.push(a.theta);
      cfg.se.push(a.se);
      zero.theta.push(b.theta);
      zero.se.push(b.se);
    }

    const asProfile = (t: Record<string, number>, s: Record<string, number>, answered: number): LatentProfile => ({
      theta: t,
      se: s,
      quality: 1,
      answered,
    });

    const topK = (model: typeof cfg) => {
      const totals: number[][] = model.theta.map(() => new Array<number>(N).fill(-1));
      for (let i = 0; i < N; i += 1) {
        for (let j = i + 1; j < N; j += 1) {
          const t = pairScore(
            asProfile(model.theta[i]!, model.se[i]!, tookBridge[i]! ? 39 : 24),
            asProfile(model.theta[j]!, model.se[j]!, tookBridge[j]! ? 39 : 24),
            MATCHING_CONFIG.tracks.romance,
            MATCHING_CONFIG.categories,
          ).total;
          totals[i]![j] = t;
          totals[j]![i] = t;
        }
      }
      return totals.map((row) => row.map((value, index) => ({ value, index })).sort((x, y) => y.value - x.value).slice(0, K).map((x) => x.index));
    };

    const listCfg = topK(cfg);
    const listZero = topK(zero);
    let inter = 0;
    let union = 0;
    let changedPeople = 0;
    for (let i = 0; i < N; i += 1) {
      const a = new Set(listCfg[i]!);
      const b = new Set(listZero[i]!);
      const common = [...a].filter((x) => b.has(x)).length;
      inter += common;
      union += new Set([...a, ...b]).size;
      if (common < K) changedPeople += 1;
    }
    console.log(
      `Top-${K} por persona sobre ${N} perfiles (mitad con puente, mitad sin puente).\n` +
        `Jaccard medio entre priors de config y priors a cero: ${(inter / union).toFixed(3)}\n` +
        `Personas cuyo top-${K} cambia al menos un nombre: ${changedPeople} de ${N} (${((changedPeople / N) * 100).toFixed(1)}%)`,
    );
    expect(N).toBe(120);
    // Descoplar el puente (priors a cero) renueva casi la mitad del top-3: es
    // un cambio de producto, no un "no tocar nada". Con los pisos fuera (ADR-043)
    // el panorama es más suave y la medida bajó de >0,5 a 0,475; el suelo del
    // discurso sigue siendo «casi la mitad de las personas ve nombres nuevos».
    expect(inter / union).toBeLessThan(0.7);
    expect(changedPeople / N).toBeGreaterThan(0.4);
  }, 120_000);
});
