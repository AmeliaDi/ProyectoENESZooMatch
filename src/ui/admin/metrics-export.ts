/**
 * Presentation helpers for the admin dashboard: CSV export and coverage.
 * CSV output is UTF-8 (BOM) with CRLF rows and neutralizes spreadsheet
 * formula injection.
 */
import type { AdminMetrics } from "@/contracts/admin-metrics";

/** The sixteen MBTI signals, kept as a secondary metric. */
export const MBTI_CODES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

/**
 * Neutralizes spreadsheet formula injection by prefixing a leading quote to any
 * cell that starts with `=`, `+`, `-` or `@`.
 */
export function protectCsvCell(value: string): string {
  if (/^[\t\r\n]/.test(value) || /^\s*[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

/**
 * Serializes the aggregates to a UTF-8 (BOM) CSV document using CRLF rows.
 * Free-text taxonomy names (animals, colours) go through {@link protectCsvCell}.
 */
export function adminMetricsToCsv(metrics: AdminMetrics): string {
  const BOM = "\uFEFF";
  const rows: string[][] = [
    ["ZooMatch — Métricas de administración"],
    ["Generado", metrics.generatedAt],
    [],
    ["Resumen"],
    ["Perfiles totales", String(metrics.totalProfiles)],
    ["En el cascarón (sin identidad fijada)", String(metrics.huevos)],
    ["Matches romance", String(metrics.romanceMatches)],
    ["Matches amistad", String(metrics.amistadMatches)],
    ["Usuarios con match romance", String(metrics.usersWithRomanceMatch)],
    ["Usuarios con match amistad", String(metrics.usersWithAmistadMatch)],
    ["Umbral romance", String(metrics.romanceThreshold)],
    ["Umbral amistad", String(metrics.amistadThreshold)],
    [],
    ["Top animales", "Id", "Cantidad"],
    ...metrics.topAnimals.map((item) => [protectCsvCell(item.name), item.id, String(item.count)]),
    [],
    ["Top colores", "Id", "Cantidad"],
    ...metrics.topColors.map((item) => [protectCsvCell(item.name), item.id, String(item.count)]),
    [],
    ["Distribución MBTI", "Cantidad"],
    ...MBTI_CODES.map((code) => [code, String(metrics.mbtiDistribution[code] ?? 0)]),
  ];
  return BOM + rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}

/** Percentage of profiles that hold at least one match on a given track. */
export function trackCoverageRate(usersWithMatch: number, totalProfiles: number): number {
  if (totalProfiles <= 0) return 0;
  return Math.min(100, (usersWithMatch / totalProfiles) * 100);
}
