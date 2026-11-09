import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { pairScore } from "@/domain/matching/pair-score";
import { mulberry32 } from "@/domain/shared/random";
import type { LatentProfile } from "@/types/latent";

import scenarios from "./bridge-prior-scenarios.data.json";
import { buildMeasurementModel, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

const SCENARIOS = scenarios as { obs: number[][]; lat: number[][] };

const coreHex = QUIZ_ITEMS.filter((i) => i.modulo === "nucleo" && i.factor?.startsWith("hex_")).map((i) => i.id);
const bridge = QUIZ_ITEMS.filter((i) => i.modulo === "puente_big_five").map((i) => i.id);
const HEX = ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"];
const K = 3;
const N = 120;

function withMatrix(matriz: readonly (readonly number[])[]) {
  return { ...PSYCHOMETRIC_PARAMS, covarianza_latente: { matriz: matriz.map((r) => [...r]) } };
}

function topK(prof: LatentProfile[]) {
  const totals: number[][] = prof.map(() => new Array<number>(N).fill(-1));
  for (let i = 0; i < N; i += 1) {
    for (let j = i + 1; j < N; j += 1) {
      const t = pairScore(prof[i]!, prof[j]!, MATCHING_CONFIG.tracks.romance, MATCHING_CONFIG.categories).total;
      totals[i]![j] = t;
      totals[j]![i] = t;
    }
  }
  return totals.map((row) =>
    row
      .map((value, index) => ({ value, index }))
      .sort((x, y) => y.value - x.value)
      .slice(0, K)
      .map((x) => x.index),
  );
}

function jaccard(a: number[][], b: number[][]) {
  let inter = 0;
  let union = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = new Set(a[i]!);
    const y = new Set(b[i]!);
    const common = [...x].filter((v) => y.has(v)).length;
    inter += common;
    union += new Set([...x, ...y]).size;
    if (common < K) changed += 1;
  }
  return { j: inter / union, changed };
}

describe("escenarios de priors del puente contra la configuracion actual", () => {
  it("desplazamiento de cada theta HEXACO y estabilidad del top-3", () => {
    const models = {
      config: buildMeasurementModel(PSYCHOMETRIC_PARAMS),
      obs: buildMeasurementModel(withMatrix(SCENARIOS.obs)),
      lat: buildMeasurementModel(withMatrix(SCENARIOS.lat)),
    } as const;
    const lower = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz);

    const shift: Record<string, { obs: number[]; lat: number[] }> = {};
    for (const h of HEX) shift[h] = { obs: [], lat: [] };
    const profiles: Record<keyof typeof models, LatentProfile[]> = {
      config: [],
      obs: [],
      lat: [],
    };
    const tookBridge: boolean[] = [];

    for (let p = 0; p < N; p += 1) {
      const truth = drawTheta(lower, mulberry32(700000 + p));
      const usesBridge = p % 2 === 0;
      tookBridge.push(usesBridge);
      const ids = usesBridge ? [...coreHex, ...bridge] : coreHex;
      const responses = simulateResponses(models.config, ids, truth, mulberry32(800000 + p));
      const base = scoreLatent(models.config, responses, MATCHING_CONFIG.quality);
      for (const key of ["obs", "lat"] as const) {
        const alt = scoreLatent(models[key], responses, MATCHING_CONFIG.quality);
        for (const h of HEX) {
          const d = Math.abs((alt.theta[h] ?? 0) - (base.theta[h] ?? 0));
          shift[h]![key === "obs" ? "obs" : "lat"].push(d);
        }
        profiles[key].push({ theta: alt.theta, se: alt.se, quality: 1, answered: ids.length });
      }
      profiles.config.push({ theta: base.theta, se: base.se, quality: 1, answered: ids.length });
    }

    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    console.log("N = 120 perfiles, mitad con puente (39 items), mitad solo nucleo (24).");
    console.log("|prior| medio por factor (solo quienes contestaron el puente) y maximo:");
    for (const h of HEX) {
      const idx = tookBridge.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
      const mo = mean(idx.map((i) => shift[h]!.obs[i]!));
      const ml = mean(idx.map((i) => shift[h]!.lat[i]!));
      const xo = Math.max(...idx.map((i) => shift[h]!.obs[i]!));
      const xl = Math.max(...idx.map((i) => shift[h]!.lat[i]!));
      const sin = tookBridge.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
      const core = Math.max(...sin.map((i) => Math.max(shift[h]!.obs[i]!, shift[h]!.lat[i]!)));
      console.log(
        `  ${h}: OBS media ${mo.toFixed(3)} DE (max ${xo.toFixed(3)}) | LAT media ${ml.toFixed(3)} DE (max ${xl.toFixed(3)}) | mayor entre solo-nucleo ${core.toFixed(4)}`,
      );
    }

    const cfg = topK(profiles.config);
    const r = { obs: jaccard(cfg, topK(profiles.obs)), lat: jaccard(cfg, topK(profiles.lat)) };
    for (const key of ["obs", "lat"] as const) {
      console.log(`top-${K} vs config, escenario ${key.toUpperCase()}: Jaccard ${r[key].j.toFixed(3)}, personas con al menos un nombre distinto ${r[key].changed}/${N} (${((r[key].changed / N) * 100).toFixed(1)}%)`);
    }
    // Cuanto mas lejos de 1 la proyeccion arrastra los priors, mas se reordena
    // el top-3 publicado: el escenario desatenuado es el peor caso.
    expect(r.lat.j).toBeLessThan(r.obs.j);
    expect(r.lat.changed).toBeGreaterThan(r.obs.changed);
    expect(r.obs.changed / N).toBeGreaterThan(0.1);
    expect(N).toBe(120);
  }, 180_000);
});
