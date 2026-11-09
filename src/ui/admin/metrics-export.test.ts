import { describe, expect, it } from "vitest";

import {
  adminMetricsSchema,
  emptyAdminMetrics,
  parseAdminMetrics,
  type AdminMetrics,
} from "@/contracts/admin-metrics";
import { getAmistadThreshold, getRomanceThreshold } from "@/domain/matching";

import { adminMetricsToCsv, protectCsvCell, trackCoverageRate } from "./metrics-export";

// Built on `emptyAdminMetrics` so the fixture cannot fall behind the schema:
// a section added to the contract arrives here as zeros, not as a type error
// fixed by hand later.
const METRICS: AdminMetrics = {
  ...emptyAdminMetrics(0.65, 0.68),
  generatedAt: "2026-10-25T12:00:00.000Z",
  totalProfiles: 400,
  romanceMatches: 120,
  amistadMatches: 240,
  usersWithRomanceMatch: 80,
  usersWithAmistadMatch: 160,
  huevos: 17,
  topAnimals: [{ id: "ajolotito", name: "ajolotito", count: 12 }],
  topColors: [{ id: "verde-esmeralda", name: "verde esmeralda", count: 9 }],
  mbtiDistribution: { INTJ: 30, ENFP: 25 },
};

describe("admin metrics validation", () => {
  it("accepts a complete payload", () => {
    expect(adminMetricsSchema.safeParse(METRICS).success).toBe(true);
    expect(parseAdminMetrics(METRICS)).toEqual(METRICS);
  });

  it("rejects out-of-range thresholds and negative counters", () => {
    expect(
      parseAdminMetrics({ ...METRICS, romanceThreshold: 1 }),
    ).toBeNull();
    expect(
      parseAdminMetrics({ ...METRICS, totalProfiles: -1 }),
    ).toBeNull();
    expect(parseAdminMetrics({ ...METRICS, topAnimals: "nope" })).toBeNull();
  });

  it("counts the unhatched, and refuses a breakdown without the stored id", () => {
    expect(parseAdminMetrics({ ...METRICS, huevos: -1 })).toBeNull();
    expect(parseAdminMetrics({ ...METRICS, huevos: null })).toBeNull();
    // Grouping is by the id frozen on eclosion, so a name alone is not a cell.
    expect(parseAdminMetrics({ ...METRICS, topAnimals: [{ animal: "ajolotito", count: 12 }] })).toBeNull();
    expect(parseAdminMetrics({ ...METRICS, topColors: [{ color: "verde esmeralda", count: 9 }] })).toBeNull();
  });

  it("accepts the calibrated thresholds, which may sit below 0.5", () => {
    expect(parseAdminMetrics({ ...METRICS, romanceThreshold: getRomanceThreshold(), amistadThreshold: getAmistadThreshold() })).not.toBeNull();
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formula injection", () => {
    expect(protectCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(protectCsvCell("+1")).toBe("'+1");
    expect(protectCsvCell("-1")).toBe("'-1");
    expect(protectCsvCell("@cmd")).toBe("'@cmd");
    expect(protectCsvCell("  =SUM(A1:A2)")).toBe("'  =SUM(A1:A2)");
    expect(protectCsvCell("\t=SUM(A1:A2)")).toBe("'\t=SUM(A1:A2)");
    expect(protectCsvCell("ajolotito")).toBe("ajolotito");
  });

  it("emits a BOM-prefixed CRLF document with both tracks", () => {
    const csv = adminMetricsToCsv(METRICS);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("Matches romance,120");
    expect(csv).toContain("Matches amistad,240");
    expect(csv).toContain("En el cascarón (sin identidad fijada),17");
    expect(csv).toContain("Top animales,Id,Cantidad");
    expect(csv).toContain("ajolotito,ajolotito,12");
    expect(csv).toContain("verde esmeralda,verde-esmeralda,9");
    expect(csv).toContain("INTJ,30");
    expect(csv).toContain("ENFP,25");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("CSV observatorio ampliado", () => {
  it("conserves every live pair across the histogram rows", () => {
    const rows = section(adminMetricsToCsv(OBSERVATORY), "Histograma de similitud");
    const romance = rows.filter((row) => row[0] === "romance");
    const total = romance.reduce((sum, row) => sum + Number(row[3]), 0);
    expect(romance).toHaveLength(14);
    expect(total).toBe(OBSERVATORY.matching.romance.filas);
    expect(romance[0]![1]).toBe("bajoUmbral");
    expect(romance.at(-1)![1]).toBe("sobreEje");
  });

  it("exports the funnel with both rates beside the count", () => {
    const rows = section(adminMetricsToCsv(OBSERVATORY), "Embudo");
    const third = rows.find((row) => row[0] === "Con identidad fijada")!;
    expect(third.slice(1)).toEqual(["40", "80", "89"]);
    expect(rows.at(-1)![0]).toBe("Presentes con afinidad de amistad");
  });

  it("protects a tally whose author typed a formula", () => {
    const csv = adminMetricsToCsv(OBSERVATORY);
    expect(csv).toContain("ligues,4,2026-11-08T00:00:00.000Z,'=AJOL*VERDE");
  });

  it("prints a dash for a quantile nobody reached", () => {
    const empty = { ...OBSERVATORY, eclosion: { medianaHoras: null, p75Horas: null, muestra: 0 } };
    const rows = section(adminMetricsToCsv(empty), "Tiempo hasta eclosionar");
    expect(rows[0]).toEqual(["", "—", "—", "0"]);
  });

  it("names audit actions in words and orders them by size", () => {
    const rows = section(adminMetricsToCsv(OBSERVATORY), "Auditoría");
    expect(rows[0]).toEqual(["Entró al observatorio", "2"]);
    expect(rows[1]).toEqual(["Borró una cuenta", "1"]);
  });

  it("translates the composition groups", () => {
    const csv = adminMetricsToCsv(OBSERVATORY);
    expect(csv).toContain("eneagrama,9w1,3");
    expect(csv).toContain("marcas,autoconservación,2");
    expect(csv).toContain("módulos,5 módulos,9");
  });

  it("keeps every section of a legacy payload readable", () => {
    const csv = adminMetricsToCsv(METRICS);
    expect(csv).toContain("Serie diaria,Día,Altas,Encuestas,Eclosiones,Pausas,Bajas\r\n\r\nEmbudo");
    expect(csv).toContain("Ventana (días),Desde,Hasta\r\n,0,—,—");
  });
});

describe("track coverage", () => {
  it("computes the percentage of profiles with a match", () => {
    expect(trackCoverageRate(80, 400)).toBe(20);
    expect(trackCoverageRate(0, 0)).toBe(0);
    expect(trackCoverageRate(500, 400)).toBe(100);
  });
});

// The extended observatory, with the production calibration for romance.
const OBSERVATORY: AdminMetrics = {
  ...METRICS,
  ventanaDias: 30,
  desde: "2026-10-10",
  hasta: "2026-11-08",
  referencias: { romance: 0.5877, amistad: null },
  series: [
    { day: "2026-11-01", altas: 4, encuestas: 2, eclosiones: 0, pausas: 0, bajas: 0 },
    { day: "2026-11-02", altas: 1, encuestas: 0, eclosiones: 3, pausas: 1, bajas: 1 },
  ],
  embudo: { registradas: 50, conEncuesta: 45, eclosionados: 40, presentes: 36, conRomance: 20, conAmistad: 30 },
  eclosion: { medianaHoras: 6.5, p75Horas: 20.25, muestra: 40 },
  matching: {
    romance: {
      filas: 10, conAfinidad: 8, aislados: 2, media: 0.55, p50: 0.54, p90: 0.61, max: 0.7,
      bajoUmbral: 3, bins: [{ i: 0, n: 4 }, { i: 4, n: 3 }], sobreEje: 0,
    },
    amistad: {
      filas: 0, conAfinidad: 0, aislados: 0, media: null, p50: null, p90: null, max: null,
      bajoUmbral: 0, bins: [], sobreEje: 0,
    },
  },
  composicion: { eneagrama: { "9w1": 3 }, marcas: { sp: 2 }, modulos: [{ n: 5, total: 9 }] },
  contadores: [{ key: "ligues", value: 4, actualizadoEn: "2026-11-08T00:00:00.000Z", actualizadoPor: "=AJOL*VERDE" }],
  auditoria: { total: 3, porAccion: { login: 2, delete_user: 1 }, porDia: [{ day: "2026-11-08", n: 3 }] },
};

/** Rows of one section: everything after its header line until the blank line. */
function section(csv: string, header: string): string[][] {
  const bom = String.fromCharCode(0xfeff);
  const rows = csv.replace(bom, "").split("\r\n").map((line) => line.split(","));
  const start = rows.findIndex((row) => row[0] === header);
  if (start < 0) throw new Error(`missing section ${header}`);
  const out: string[][] = [];
  for (const row of rows.slice(start + 1)) {
    if (row.length === 1 && row[0] === "") break;
    out.push(row);
  }
  return out;
}
