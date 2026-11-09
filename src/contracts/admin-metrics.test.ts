import { describe, expect, it } from "vitest";

import { adminMetricsSchema, hasObservatory, parseAdminMetrics } from "./admin-metrics";

/** Exactly what the deployed two-argument RPC answers: no new section at all. */
const LEGACY = {
  generatedAt: "2026-11-08T23:00:00Z",
  romanceThreshold: 0.5374,
  amistadThreshold: 0.4643,
  totalProfiles: 167,
  huevos: 54,
  romanceMatches: 276,
  amistadMatches: 720,
  usersWithRomanceMatch: 132,
  usersWithAmistadMatch: 163,
  topAnimals: [{ id: "ajolote", name: "ajolote", count: 21 }],
  topColors: [{ id: "turquesa", name: "turquesa", count: 18 }],
  mbtiDistribution: { INTJ: 26, ENFP: 11 },
};

const OBS = {
  ...LEGACY,
  referencias: { romance: 0.5877, amistad: 0.5524 },
  ventanaDias: 30,
  desde: "2026-10-10",
  hasta: "2026-11-08",
  series: [
    { day: "2026-11-07", altas: 38, encuestas: 36, eclosiones: 29, pausas: 0, bajas: 0 },
    { day: "2026-11-08", altas: 7, encuestas: 10, eclosiones: 6, pausas: 0, bajas: 0 },
  ],
  embudo: { registradas: 207, conEncuesta: 164, eclosionados: 164, presentes: 164, conRomance: 132, conAmistad: 163 },
  eclosion: { medianaHoras: 64.98, p75Horas: 84.95, muestra: 165 },
  matching: {
    romance: {
      filas: 276, conAfinidad: 132, aislados: 32, media: 0.5762, p50: 0.5737, p90: 0.6064, max: 0.6574,
      bajoUmbral: 0, bins: [{ i: 0, n: 39 }, { i: 4, n: 30 }, { i: 11, n: 1 }], sobreEje: 0,
    },
    amistad: {
      filas: 720, conAfinidad: 163, aislados: 1, media: 0.5504, p50: 0.5493, p90: 0.5932, max: 0.6664,
      bajoUmbral: 0, bins: [{ i: 3, n: 199 }], sobreEje: 0,
    },
  },
  composicion: { eneagrama: { "8": 11, "1w9": 4 }, marcas: { sx: 19, sp: 6 }, modulos: [{ n: 0, total: 73 }] },
  contadores: [
    { key: "ligues", value: 3, actualizadoEn: "2026-11-08T23:44:08.044Z", actualizadoPor: "mariquita azul cobalto · VTMJ" },
    { key: "novios", value: 0, actualizadoEn: "2026-11-08T23:44:08.323Z", actualizadoPor: null },
  ],
  auditoria: { total: 28, porAccion: { login: 9, counter_update: 5 }, porDia: [{ day: "2026-11-08", n: 5 }] },
};

/**
 * One field of a copy, rewritten by path. Data instead of casts: a payload the
 * database could not have produced has to be refused for its values.
 */
function withValue(path: string[], value: unknown): unknown {
  const payload = structuredClone(OBS) as Record<string, unknown>;
  let node = payload;
  for (const step of path.slice(0, -1)) node = node[step] as Record<string, unknown>;
  node[path.at(-1)!] = value;
  return payload;
}

describe("admin metrics contract (ADR-036)", () => {
  it("parses the extended payload and keeps every section", () => {
    const metrics = parseAdminMetrics(OBS);
    expect(metrics).not.toBeNull();
    expect(hasObservatory(metrics!)).toBe(true);
    expect(metrics!.series).toHaveLength(2);
    expect(metrics!.embudo.presentes).toBe(164);
    expect(metrics!.matching.romance.bins).toEqual([{ i: 0, n: 39 }, { i: 4, n: 30 }, { i: 11, n: 1 }]);
    expect(metrics!.contadores.map((c) => [c.key, c.value])).toEqual([["ligues", 3], ["novios", 0]]);
    expect(metrics!.auditoria.porAccion.counter_update).toBe(5);
    expect(metrics!.composicion.marcas.sx).toBe(19);
    expect(metrics!.eclosion.medianaHoras).toBeCloseTo(64.98, 2);
  });

  it("still parses the payload of the old RPC: the new sections default, they do not throw", () => {
    const metrics = parseAdminMetrics(LEGACY);
    expect(metrics).not.toBeNull();
    expect(hasObservatory(metrics!)).toBe(false);
    expect(metrics!.totalProfiles).toBe(167);
    expect(metrics!.series).toEqual([]);
    expect(metrics!.embudo.registradas).toBe(0);
    expect(metrics!.matching.amistad.max).toBeNull();
    expect(metrics!.contadores).toEqual([]);
    // A payload that predates the observatory must not gain a fake name either.
    expect(metrics!.desde).toBeNull();
  });

  it("accepts an empty pool: percentiles are null, never zero", () => {
    const vacio = {
      ...OBS,
      eclosion: { medianaHoras: null, p75Horas: null, muestra: 0 },
      matching: {
        romance: { filas: 0, conAfinidad: 0, aislados: 0, media: null, p50: null, p90: null, max: null, bajoUmbral: 0, bins: [], sobreEje: 0 },
        amistad: { filas: 0, conAfinidad: 0, aislados: 0, media: null, p50: null, p90: null, max: null, bajoUmbral: 0, bins: [], sobreEje: 0 },
      },
    };
    const metrics = parseAdminMetrics(vacio);
    expect(metrics?.matching.romance.media).toBeNull();
    expect(metrics?.matching.amistad.bins).toEqual([]);
    expect(metrics?.eclosion.muestra).toBe(0);
  });

  it("refuses numbers that cannot come from the database", () => {
    // A similarity above 1 or below 0 is not a cosine.
    expect(parseAdminMetrics(withValue(["matching", "romance", "p50"], 1.5))).toBeNull();
    expect(parseAdminMetrics(withValue(["matching", "amistad", "media"], -0.1))).toBeNull();
    // The axis has twelve boxes; a thirteenth is a broken query, not a chart.
    expect(parseAdminMetrics(withValue(["matching", "romance", "bins"], [{ i: 12, n: 3 }]))).toBeNull();
    // A count is never negative and a window is never wider than the clamp.
    expect(parseAdminMetrics(withValue(["embudo", "presentes"], -1))).toBeNull();
    expect(parseAdminMetrics(withValue(["ventanaDias"], 121))).toBeNull();
    expect(parseAdminMetrics(withValue(["series"], Array.from({ length: 121 }, (_, i) => ({
      day: `2026-07-${String((i % 31) + 1).padStart(2, "0")}`, altas: 0, encuestas: 0, eclosiones: 0, pausas: 0, bajas: 0,
    }))))).toBeNull();
    // Days are UTC labels, not free text.
    expect(parseAdminMetrics(withValue(["hasta"], "ayer"))).toBeNull();
    expect(parseAdminMetrics(withValue(["auditoria", "porDia"], [{ day: "08/11/2026", n: 1 }]))).toBeNull();
    // NaN would draw a bar of no height and a label that reads "NaN".
    expect(parseAdminMetrics(withValue(["eclosion", "medianaHoras"], Number.NaN))).toBeNull();
    // An unknown action is a key in a record, not a crash: SQL owns that list.
    expect(parseAdminMetrics(withValue(["auditoria", "porAccion"], { inventado: 3 }))).not.toBeNull();
  });

  it("names a counter the way the table stores it or rejects the payload", () => {
    for (const key of ["ligues", "novios", "besos_1"]) {
      const payload = { ...OBS, contadores: [{ key, value: 1, actualizadoEn: "2026-11-08T23:44:08.044Z", actualizadoPor: null }] };
      expect(parseAdminMetrics(payload), key).not.toBeNull();
    }
    for (const key of ["LIGUES", "lig ues", "", "1ligues", "a".repeat(33)]) {
      const payload = { ...OBS, contadores: [{ key, value: 1, actualizadoEn: "2026-11-08T23:44:08.044Z", actualizadoPor: null }] };
      expect(parseAdminMetrics(payload), JSON.stringify(key)).toBeNull();
    }
  });

  it("is an allow-list: a field that should not exist does not survive the parse", () => {
    // The RPC cannot answer these today, and the contract will not carry them
    // if a future query adds one by mistake.
    const payload = { ...OBS, matricula: "32109876", pin_hash: "x", latent_profile: [0.1], orientacion_sexual: "hetero" };
    expect(adminMetricsSchema.safeParse(payload).success).toBe(true);
    const metrics = parseAdminMetrics(payload) as unknown as Record<string, unknown>;
    for (const secret of ["matricula", "pin_hash", "latent_profile", "orientacion_sexual"]) {
      expect(metrics, secret).not.toHaveProperty(secret);
    }
    expect(JSON.stringify(metrics)).not.toContain("32109876");
  });

  it("returns null for anything that is not a metrics object", () => {
    for (const raw of [null, undefined, "dashboard", 42, [], {}]) expect(parseAdminMetrics(raw), String(raw)).toBeNull();
  });
});
