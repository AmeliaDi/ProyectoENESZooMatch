import { describe, expect, it } from "vitest";

import raw from "../../data/db-perf.json";
import { DB_PERF, dbPerfSchema } from "./db-perf";
import { loadConfig } from "./load";

const clone = <T>(value: T): T => structuredClone(value);
const reload = (mutate: (draft: typeof raw) => void) => {
  const draft = clone(raw);
  mutate(draft);
  return () => loadConfig("db-perf", dbPerfSchema, draft);
};

const IDS = Object.keys(DB_PERF.presupuestos) as Array<keyof typeof DB_PERF.presupuestos>;

describe("data/db-perf.json", () => {
  it("carga todos los presupuestos y los congela", () => {
    expect(IDS).toHaveLength(10);
    for (const id of IDS) expect(DB_PERF.presupuestos[id].max_ms).toBeGreaterThan(0);
    expect(Object.isFrozen(DB_PERF.presupuestos.replace_matches)).toBe(true);
  });

  it("declara una población con la que las mediciones tienen sentido", () => {
    const hatched = Math.round(DB_PERF.poblacion.perfiles * DB_PERF.poblacion.ratio_eclosionados);
    expect(hatched).toBeGreaterThanOrEqual(2);
    expect(DB_PERF.poblacion.top_k).toBeLessThan(hatched);
    expect(DB_PERF.poblacion.bajas).toBeLessThanOrEqual(DB_PERF.poblacion.perfiles);
    expect(DB_PERF.poblacion.huevos_completos + hatched).toBeLessThanOrEqual(DB_PERF.poblacion.perfiles);
  });

  it("rechaza un presupuesto en cero", () => {
    expect(reload((draft) => (draft.presupuestos.get_pool_version.max_ms.valor = 0))).toThrow(/max_ms/);
  });

  it("rechaza un top-k más grande que el pool eclosionado", () => {
    expect(reload((draft) => (draft.poblacion.top_k.valor = 10_000))).toThrow(/top_k/);
  });

  it("rechaza una población sin pares posibles", () => {
    expect(reload((draft) => (draft.poblacion.ratio_eclosionados.valor = 0))).toThrow(/pool eclosionado/);
  });

  it("rechaza una siembra que viole el límite de tres preguntas del rompehielos", () => {
    expect(reload((draft) => (draft.poblacion.rondas_por_conversacion.valor = 4))).toThrow(/rondas_por_conversacion/);
  });

  it("rechaza una etiqueta de procedencia que no existe", () => {
    expect(reload((draft) => (draft.presupuestos.get_user_matches.max_ms.etiqueta = "medido_produccion"))).toThrow();
  });

  it("rechaza una muestra que apunta a un huevo cuando debe leer pares", () => {
    expect(reload((draft) => (draft.entradas.marcas_de_muestra.get_user_matches.valor = 599))).toThrow(/eclosionado/);
  });

  it("rechaza una muestra de eclosión que apunta a un perfil ya eclosionado", () => {
    expect(reload((draft) => (draft.entradas.marcas_de_muestra.hatch_profile_identity.valor = 3))).toThrow(/rango de huevos/);
  });

  it("rechaza eclosionar más huevos de los que existen", () => {
    expect(reload((draft) => (draft.medicion.muestra_hatch.valor = 5_000))).toThrow(/huevos disponibles/);
  });
});
