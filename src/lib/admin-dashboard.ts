import { z } from "zod";

export const MBTI_CODES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

const adminMetricsSchema = z.object({
  generatedAt: z.string().min(1),
  threshold: z.number().min(0.85).lt(1),
  totalProfiles: z.number().int().nonnegative(),
  matchedUsers: z.number().int().nonnegative(),
  matchedPercentage: z.number().min(0).max(100),
  mbtiDistribution: z.array(
    z.object({
      code: z.enum(MBTI_CODES),
      count: z.number().int().nonnegative(),
    }),
  ).length(MBTI_CODES.length),
  topAnimals: z.array(
    z.object({
      animal: z.string().min(1).max(160),
      count: z.number().int().nonnegative(),
    }),
  ).max(5),
}).superRefine(({ mbtiDistribution }, context) => {
  const submitted = new Set(mbtiDistribution.map(({ code }) => code));
  if (MBTI_CODES.some((code) => !submitted.has(code))) {
    context.addIssue({ code: "custom", message: "Incomplete MBTI distribution" });
  }
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

export function parseAdminMetrics(value: unknown): AdminMetrics | null {
  const parsed = adminMetricsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function protectCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function adminMetricsToCsv(metrics: AdminMetrics): string {
  const rows: Array<Array<string | number>> = [
    ["section", "label", "value", "percentage"],
    ["summary", "total_profiles", metrics.totalProfiles, ""],
    ["summary", "users_with_match_above_threshold", metrics.matchedUsers, metrics.matchedPercentage],
    ["summary", "active_threshold_exclusive", metrics.threshold, ""],
    ...metrics.mbtiDistribution.map(({ code, count }) => ["mbti", code, count, ""]),
    ...metrics.topAnimals.map(({ animal, count }) => ["animal", animal, count, ""]),
  ];

  return `\uFEFF${rows.map((row) => row.map(protectCsvCell).join(",")).join("\r\n")}\r\n`;
}
