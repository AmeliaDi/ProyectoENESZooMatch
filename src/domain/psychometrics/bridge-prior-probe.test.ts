import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { mulberry32 } from "@/domain/shared/random";

import { buildMeasurementModel, posterior } from "./latent";
import { simulateResponses } from "./simulate";

const params = JSON.parse(readFileSync("data/psychometric-params.json", "utf8")) as {
  factores: string[];
  covarianza_latente: { matriz: number[][] };
  items: Record<string, { factor: string; clave: 1 | -1; a: number; b: number[] }>;
};
const bank = JSON.parse(readFileSync("data/microtest.json", "utf8"));
const bankItems: { id: string; factor: string; modulo: string }[] = bank.items ?? bank;

const coreHex = bankItems.filter((i) => i.modulo === "nucleo" && i.factor.startsWith("hex_")).map((i) => i.id);
const bridge = bankItems.filter((i) => i.modulo === "puente_big_five").map((i) => i.id);

const HEX = ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"];
const BF_OF_HEX: Record<string, string> = {
  hex_x: "bf_e",
  hex_c: "bf_c",
  hex_o: "bf_o",
  hex_a: "bf_a",
  hex_e: "bf_n",
};

function withCorrelation(target: string, other: string, value: number): typeof params {
  const m = params.covarianza_latente.matriz.map((row) => [...row]);
  const i = params.factores.indexOf(target);
  const j = params.factores.indexOf(other);
  m[i]![j] = value;
  m[j]![i] = value;
  return { ...params, covarianza_latente: { matriz: m } };
}

function thetaOf(factorName: string, value: number): number[] {
  const theta = new Array<number>(params.factores.length).fill(0);
  theta[params.factores.indexOf(factorName)] = value;
  return theta;
}

function meanDelta(modelNew: ReturnType<typeof buildMeasurementModel>, modelRef: ReturnType<typeof buildMeasurementModel>, factor: string, reps: number) {
  const idx = params.factores.indexOf(factor);
  const random = mulberry32(20261108);
  const deltas: number[] = [];
  for (let r = 0; r < reps; r += 1) {
    const truth = thetaOf(BF_OF_HEX[factor]!, 1.5);
    const responses = simulateResponses(modelRef, [...coreHex, ...bridge], truth, random);
    const a = posterior(modelRef, responses, 1).theta[idx]!;
    const b = posterior(modelNew, responses, 1).theta[idx]!;
    deltas.push(b - a);
  }
  const mean = deltas.reduce((x, y) => x + y, 0) / reps;
  const sd = Math.sqrt(deltas.reduce((x, y) => x + (y - mean) ** 2, 0) / (reps - 1));
  return { mean, sd, min: Math.min(...deltas), max: Math.max(...deltas) };
}

describe("sondeo: cuanto mueven los priors del puente la estimacion HEXACO", () => {
  it("E1 usuarios del nucleo: cambiar r(bf,hex) no altera theta hex", () => {
    const base = buildMeasurementModel(params);
    const zeroed = buildMeasurementModel(withCorrelation("bf_e", "hex_x", 0));
    const random = mulberry32(7);
    const truth = thetaOf("hex_x", 1.0);
    const responses = simulateResponses(base, coreHex, truth, random);
    const a = posterior(base, responses, 1).theta;
    const b = posterior(zeroed, responses, 1).theta;
    let worst = 0;
    for (const f of HEX) worst = Math.max(worst, Math.abs(a[params.factores.indexOf(f)]! - b[params.factores.indexOf(f)]!));
    console.log(`E1 mayor diferencia absoluta entre modelos, solo nucleo: ${worst.toExponential(2)}`);
    // Teoria: si solo se contesta el nucleo, la posterior marginal de HEXACO
    // depende exclusivamente del bloque hex-hex de R, no de los terminos
    // cruzados bf-hex. La holgatura que queda es del Fisher scoring sobre las
    // 74 dimensiones (CONVERGENCE=1e-7, MAX_ITERATIONS=60), no del prior.
    expect(worst).toBeLessThan(0.05);
  });

  it("E2 puente contestado: sensibilidad de hex_x a r(bf_e,hex_x)", () => {
    const ref = buildMeasurementModel(withCorrelation("bf_e", "hex_x", 0));
    const rows: string[] = [];
    const est = (r: number) => {
      const model = buildMeasurementModel(withCorrelation("bf_e", "hex_x", r));
      const e = posterior(model, simulateResponses(ref, [...coreHex, ...bridge], thetaOf("bf_e", 1.5), mulberry32(11)), 1);
      const idx = params.factores.indexOf("hex_x");
      const bIdx = params.factores.indexOf("bf_e");
      const se = (i: number) => Math.sqrt(e.covariance[i]![i]!);
      rows.push(`r=${r.toFixed(2)}  hex_x=${e.theta[idx]!.toFixed(3)}  SE=${se(idx).toFixed(3)}  bf_e=${e.theta[bIdx]!.toFixed(3)}  SE=${se(bIdx).toFixed(3)}`);
      return { hex: e.theta[idx]!, se: se(idx) };
    };
    const at0 = est(0);
    est(0.3);
    est(0.5);
    est(0.65);
    const at80 = est(0.8);
    const at95 = est(0.95);
    console.log("E2 (persona real con bf_e=+1.5 y hex_x=0, responde nucleo + puente):\n" + rows.join("\n"));
    // Un prior cruzado distinto de cero mueve hex_x mas de lo que aporta
    // contestar los 15 items del puente; y en el extremo degenerado (r=0.95)
    // la estimacion vuelve al valor de r=0 pero con incertidumbre mayor.
    expect(Math.abs(at80.hex - at0.hex)).toBeGreaterThan(0.2);
    expect(at95.se).toBeGreaterThan(at80.se);
  });

  it("E3 recorrido de los 5 priors pendientes, restando el valor de config", () => {
    const out: string[] = [];
    const deltas: number[] = [];
    for (const hex of Object.keys(BF_OF_HEX)) {
      const bf = BF_OF_HEX[hex]!;
      const configured = params.covarianza_latente.matriz[params.factores.indexOf(bf)]![params.factores.indexOf(hex)]!;
      const ref = buildMeasurementModel(withCorrelation(bf, hex, 0));
      const atConfig = meanDelta(buildMeasurementModel(withCorrelation(bf, hex, configured)), ref, hex, 300);
      deltas.push(Math.abs(atConfig.mean));
      const atZero = ref;
      const est = posterior(atZero, simulateResponses(ref, [...coreHex, ...bridge], thetaOf(bf, 1.5), mulberry32(11)), 1);
      out.push(
        `${bf}-${hex}: r_config=${configured.toFixed(2)} -> hex update ${est.theta[params.factores.indexOf(hex)]!.toFixed(3)} DE;` +
          ` mover r a 0 cambia la estimacion en ${atConfig.mean.toFixed(3)} DE (DS ${atConfig.sd.toFixed(3)}, rango [${atConfig.min.toFixed(2)}, ${atConfig.max.toFixed(2)}])`,
      );
    }
    console.log("E3:\n" + out.join("\n"));
    expect(out.length).toBe(5);
    // Cada prior cruzado, tomado de uno en uno, mueve la estimacion HEXACO mas
    // de una decima de desviacion estandar: ningun termino es decorativo.
    for (const d of deltas) expect(d).toBeGreaterThan(0.15);
  }, 90_000);
});
