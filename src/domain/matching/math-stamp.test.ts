/**
 * Sellos de la matemática (B9, ADR-052): lo que se mide con `estimado_sintetico`
 * es que las dos mitades se mueven por separado. Un peso nuevo no re-estima a
 * nadie; un enunciado nuevo sí invalida el θ guardado.
 */
import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG } from "@/config/matching";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { QUIZ_ITEMS } from "@/config/quiz";

import type { MeasurementStampInput, StampItem, StampParams } from "./math-stamp";
import { bankVersionOf, firmOf, isCurrentStamp, measurementFirm, paramsVersionOf, scoringFirm } from "./math-stamp";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bank(): StampItem[] {
  return QUIZ_ITEMS.map((item) => ({
    id: item.id,
    texto: item.texto,
    modulo: item.modulo,
    factor: item.factor || null,
    tipo: item.tipo_respuesta,
    opciones: item.opciones ? [...item.opciones] : null,
    polaridad: item.polaridad ?? null,
    romance: item.track_romance,
    amistad: item.track_amistad,
    filtro_duro: item.filtro_duro,
  }));
}

function params(): StampParams {
  const items: Record<string, { factor: string; clave: number; a: number; b: readonly number[] }> = {};
  for (const [id, item] of Object.entries(PSYCHOMETRIC_PARAMS.items)) {
    items[id] = { factor: item.factor, clave: item.clave, a: item.a, b: item.b };
  }
  return { factores: PSYCHOMETRIC_PARAMS.factores, covarianza: PSYCHOMETRIC_PARAMS.covarianza_latente.matriz, items };
}

function input(overrides: Partial<MeasurementStampInput> = {}): MeasurementStampInput {
  return { params: params(), bank: bank(), paramsInputHash: PSYCHOMETRIC_PARAMS.entrada_sha256, ...overrides };
}

describe("sello de la matemática", () => {
  it("es estable ante reordenar las llaves del config", () => {
    const shuffled = clone(MATCHING_CONFIG) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(shuffled).reverse());
    expect(scoringFirm(reordered as unknown as typeof MATCHING_CONFIG)).toBe(scoringFirm(MATCHING_CONFIG));
  });

  it("se mueve con un peso, y la medición no se entera", () => {
    const next = clone(MATCHING_CONFIG) as unknown as typeof MATCHING_CONFIG;
    next.tracks.romance.core.personalidad = 0.49;
    expect(scoringFirm(next)).not.toBe(scoringFirm(MATCHING_CONFIG));
    expect(measurementFirm(input())).toBe(measurementFirm(input()));
  });

  it("se mueve con el umbral y con una tolerancia", () => {
    const threshold = clone(MATCHING_CONFIG) as unknown as typeof MATCHING_CONFIG;
    threshold.tracks.amistad.minimum_similarity_exclusive = 0.47;
    expect(scoringFirm(threshold)).not.toBe(scoringFirm(MATCHING_CONFIG));

    const tolerance = clone(MATCHING_CONFIG) as unknown as typeof MATCHING_CONFIG;
    const relacional = tolerance.categories.relacional;
    if (relacional.kind === "deadzone") relacional.tolerance.rel_autonomia = 0.5;
    expect(scoringFirm(tolerance)).not.toBe(scoringFirm(MATCHING_CONFIG));
  });

  it("no se mueve con la semilla de la calibración: no publica ningún número", () => {
    const next = clone(MATCHING_CONFIG) as unknown as typeof MATCHING_CONFIG;
    next.calibration.seed = 991;
    expect(scoringFirm(next)).toBe(scoringFirm(MATCHING_CONFIG));
  });

  it("un enunciado reescrito invalida el perfil guardado", () => {
    const moved = bank().map((i) => (i.id === "H1" ? { ...i, texto: "Otra forma de decirlo." } : i));
    expect(measurementFirm(input({ bank: moved }))).not.toBe(measurementFirm(input()));
  });

  it("una carga re-estimada invalida el perfil aunque el enunciado sea el mismo", () => {
    const next = params();
    const first = Object.keys(next.items)[0]!;
    (next.items as Record<string, { a: number }>)[first]!.a = 1.5;
    expect(measurementFirm(input({ params: next }))).not.toBe(measurementFirm(input()));
  });

  it("el sello se lee sin manual y la firma se recupera de él", () => {
    const seal = paramsVersionOf(input(), { params: "2.1.0", bank: "2.1.0" });
    expect(seal.startsWith("2.1.0+2.1.0+")).toBe(true);
    expect(firmOf(seal)).toBe(measurementFirm(input()));
    expect(isCurrentStamp(seal, seal)).toBe(true);
    // Un perfil anterior al sello no coincide, y eso nunca lo saca del pool.
    expect(isCurrentStamp(null, seal)).toBe(false);
    expect(firmOf(null)).toBeNull();
  });

  it("las dos mitades del sello son distintas: un hash no cubre la otra pregunta", () => {
    expect(scoringFirm(MATCHING_CONFIG)).not.toBe(measurementFirm(input()));
  });
});

describe("bankVersionOf", () => {
  const seal = paramsVersionOf(input(), { params: PSYCHOMETRIC_PARAMS.version, bank: "2.1.0" });

  it("lee el banco de origen del sello escrito por `submit_quiz_result`", () => {
    expect(bankVersionOf(seal)).toBe("2.1.0");
  });

  it("no devuelve banco sin una firma válida: `null` es «sin plan» en los tres casos", () => {
    expect(bankVersionOf(null)).toBeNull();
    expect(bankVersionOf("2.1.0+2.1.0")).toBeNull();
    expect(bankVersionOf("2.1.0+2.1.0+zzzzzzzzzzzz")).toBeNull();
    expect(bankVersionOf(`${PSYCHOMETRIC_PARAMS.version}+2.1.0+extra+${"0".repeat(12)}`)).toBeNull();
  });
});
