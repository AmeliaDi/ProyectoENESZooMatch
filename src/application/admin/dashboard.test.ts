import { describe, expect, it } from "vitest";

import {
  adminMetricsSchema,
  adminMetricsToCsv,
  parseAdminMetrics,
  protectCsvCell,
  trackCoverageRate,
  type AdminMetrics,
} from "./dashboard";

const METRICS: AdminMetrics = {
  generatedAt: "2026-10-25T12:00:00.000Z",
  romanceThreshold: 0.65,
  amistadThreshold: 0.68,
  totalProfiles: 400,
  romanceMatches: 120,
  amistadMatches: 240,
  usersWithRomanceMatch: 80,
  usersWithAmistadMatch: 160,
  topAnimals: [{ animal: "ajolotito", count: 12 }],
  topColors: [{ color: "verde esmeralda", count: 9 }],
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
    expect(csv).toContain("Top animales,Cantidad");
    expect(csv).toContain("ajolotito,12");
    expect(csv).toContain("INTJ,30");
    expect(csv).toContain("ENFP,25");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("track coverage", () => {
  it("computes the percentage of profiles with a match", () => {
    expect(trackCoverageRate(80, 400)).toBe(20);
    expect(trackCoverageRate(0, 0)).toBe(0);
    expect(trackCoverageRate(500, 400)).toBe(100);
  });
});
