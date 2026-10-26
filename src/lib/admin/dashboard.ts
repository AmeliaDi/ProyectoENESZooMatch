/**
 * ZooMatch — dual-track admin aggregates.
 *
 * Reports the two independent matching
 * tracks (romance + amistad) side by side, plus the colour taxonomy.
 *
 * Security contract:
 *  - only aggregate values are ever modelled here (no matriculas, no hashes,
 *    no vectors, no raw answers);
 *  - the payload coming from the admin dashboard RPC is validated with
 *    Zod before it reaches the UI or the CSV exporter;
 *  - CSV output is UTF-8 (BOM) with CRLF rows and neutralizes spreadsheet
 *    formula injection.
 */

import { z } from "zod";

/** The sixteen MBTI signals, kept as a secondary metric. */
export const MBTI_CODES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export interface AdminMetrics {
  generatedAt: string;
  romanceThreshold: number;
  amistadThreshold: number;
  totalProfiles: number;
  romanceMatches: number;
  amistadMatches: number;
  usersWithRomanceMatch: number;
  usersWithAmistadMatch: number;
  topAnimals: Array<{ animal: string; count: number }>;
  topColors: Array<{ color: string; count: number }>;
  mbtiDistribution: Record<string, number>;
}

/** Runtime validation for the admin dashboard RPC payload. */
export const adminMetricsSchema = z.object({
  generatedAt: z.string(),
  romanceThreshold: z.number().min(0.5).lt(1),
  amistadThreshold: z.number().min(0.5).lt(1),
  totalProfiles: z.number().int().min(0),
  romanceMatches: z.number().int().min(0),
  amistadMatches: z.number().int().min(0),
  usersWithRomanceMatch: z.number().int().min(0),
  usersWithAmistadMatch: z.number().int().min(0),
  topAnimals: z.array(z.object({ animal: z.string(), count: z.number() })).max(10),
  topColors: z.array(z.object({ color: z.string(), count: z.number() })).max(10),
  mbtiDistribution: z.record(z.string(), z.number()),
});

/**
 * Validates an unknown RPC payload.
 *
 * @returns the parsed metrics, or `null` when the payload is not trustworthy.
 */
export function parseAdminMetrics(raw: unknown): AdminMetrics | null {
  const result = adminMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}

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
  const rows: string[][] = [];

  rows.push(["ZooMatch — Métricas de administración"]);
  rows.push(["Generado", metrics.generatedAt]);
  rows.push([]);
  rows.push(["Resumen"]);
  rows.push(["Perfiles totales", String(metrics.totalProfiles)]);
  rows.push(["Matches romance", String(metrics.romanceMatches)]);
  rows.push(["Matches amistad", String(metrics.amistadMatches)]);
  rows.push(["Usuarios con match romance", String(metrics.usersWithRomanceMatch)]);
  rows.push(["Usuarios con match amistad", String(metrics.usersWithAmistadMatch)]);
  rows.push(["Umbral romance", String(metrics.romanceThreshold)]);
  rows.push(["Umbral amistad", String(metrics.amistadThreshold)]);
  rows.push([]);
  rows.push(["Top animales", "Cantidad"]);
  for (const item of metrics.topAnimals) {
    rows.push([protectCsvCell(item.animal), String(item.count)]);
  }
  rows.push([]);
  rows.push(["Top colores", "Cantidad"]);
  for (const item of metrics.topColors) {
    rows.push([protectCsvCell(item.color), String(item.count)]);
  }
  rows.push([]);
  rows.push(["Distribución MBTI", "Cantidad"]);
  for (const code of MBTI_CODES) {
    rows.push([code, String(metrics.mbtiDistribution[code] ?? 0)]);
  }

  return BOM + rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}

/** Percentage of profiles that hold at least one match on a given track. */
export function trackCoverageRate(usersWithMatch: number, totalProfiles: number): number {
  if (totalProfiles <= 0) return 0;
  return Math.min(100, (usersWithMatch / totalProfiles) * 100);
}
