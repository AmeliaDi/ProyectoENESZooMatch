import { describe, expect, it } from "vitest";

import {
  MBTI_CODES,
  adminMetricsToCsv,
  parseAdminMetrics,
  protectCsvCell,
  type AdminMetrics,
} from "@/lib/admin-dashboard";

const metrics: AdminMetrics = {
  generatedAt: "2026-10-22T12:00:00+00:00",
  threshold: 0.85,
  totalProfiles: 20,
  matchedUsers: 8,
  matchedPercentage: 40,
  mbtiDistribution: MBTI_CODES.map((code, index) => ({ code, count: index })),
  topAnimals: [{ animal: "=HYPERLINK(\"bad\")", count: 3 }],
};

describe("admin aggregate CSV", () => {
  it("exports UTF-8 aggregate rows without private fields", () => {
    const csv = adminMetricsToCsv(metrics);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"summary","total_profiles","20",""');
    expect(csv).toContain('"mbti","INTJ","0",""');
    expect(csv).not.toMatch(/user_id|matricula|hash|vector|answer/i);
  });

  it("neutralizes spreadsheet formulas before quoting", () => {
    expect(protectCsvCell("=2+2")).toBe('"\'=2+2"');
    expect(protectCsvCell("  @SUM(A1:A2)")).toBe('"\'  @SUM(A1:A2)"');
    expect(adminMetricsToCsv(metrics)).toContain('"\'=HYPERLINK(""bad"")"');
  });

  it("requires all sixteen MBTI buckets", () => {
    expect(parseAdminMetrics(metrics)).not.toBeNull();
    expect(parseAdminMetrics({ ...metrics, mbtiDistribution: metrics.mbtiDistribution.slice(1) })).toBeNull();
  });
});
