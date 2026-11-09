/**
 * Presentation helpers for the admin dashboard: CSV export and coverage.
 * CSV output is UTF-8 (BOM) with CRLF rows and neutralizes spreadsheet
 * formula injection.
 */
import type { AdminMetrics } from "@/contracts/admin-metrics";

import { actionWord } from "./pixel-audit";
import { markWord, moduleLabel } from "./pixel-composition";
import { funnelRows, shareOf, stepRate } from "./pixel-funnel";
import { histogramColumns } from "./pixel-histogram";

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
 * A number as the base gave it, or a dash when there was no sample to compute
 * it from. A quantile of nobody is not zero, and the spreadsheet must not say
 * otherwise.
 */
function num(value: number | null): string {
  return value === null ? "—" : String(value);
}

const TRACKS = ["romance", "amistad"] as const;
type ExportTrack = (typeof TRACKS)[number];

/**
 * One row per histogram box, using the same columns the panel draws: the two
 * off-axis buckets first, then the boxes of the normalized axis.
 */
function histogramRows(metrics: AdminMetrics, track: ExportTrack): string[][] {
  const threshold = track === "romance" ? metrics.romanceThreshold : metrics.amistadThreshold;
  const reference = metrics.referencias[track] ?? threshold;
  return histogramColumns(metrics.matching[track], threshold, reference).map((column) => [
    track,
    protectCsvCell(column.key),
    protectCsvCell(column.label),
    String(column.count),
  ]);
}

/**
 * Serializes the aggregates to a UTF-8 (BOM) CSV document using CRLF rows.
 * Free-text names (animals, colours, tally author) go through
 * {@link protectCsvCell}; every number travels as the base gave it.
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

    // ── Observatorio ampliado: the same numbers the panels draw, in words ──
    [],
    ["Observatorio", "Ventana (días)", "Desde", "Hasta"],
    ["", String(metrics.ventanaDias), metrics.desde ?? "—", metrics.hasta ?? "—"],
    [],
    ["Serie diaria", "Día", "Altas", "Encuestas", "Eclosiones", "Pausas", "Bajas"],
    ...metrics.series.map((day) => [
      day.day,
      String(day.altas),
      String(day.encuestas),
      String(day.eclosiones),
      String(day.pausas),
      String(day.bajas),
    ]),
    [],
    ["Embudo", "Paso", "Personas", "% del inicio", "% del paso anterior"],
    ...funnelRows(metrics.embudo).map((row) => [
      protectCsvCell(row.label),
      String(row.count),
      String(shareOf(row.count, metrics.embudo.registradas)),
      row.of === null ? "—" : num(stepRate(row.count, row.of)),
    ]),
    [],
    ["Tiempo hasta eclosionar", "Mediana (h)", "p75 (h)", "Muestra"],
    ["", num(metrics.eclosion.medianaHoras), num(metrics.eclosion.p75Horas), String(metrics.eclosion.muestra)],
    [],
    ["Calidad por pista", "Pista", "Filas", "Con afinidad", "Aislados", "Media", "p50", "p90", "Máx", "Bajo umbral", "Sobre eje"],
    ...TRACKS.map((track) => {
      const quality = metrics.matching[track];
      return [
        track,
        String(quality.filas),
        String(quality.conAfinidad),
        String(quality.aislados),
        num(quality.media),
        num(quality.p50),
        num(quality.p90),
        num(quality.max),
        String(quality.bajoUmbral),
        String(quality.sobreEje),
      ];
    }),
    [],
    ["Histograma de similitud", "Pista", "Caja", "Rango", "Parejas"],
    ...TRACKS.flatMap((track) => histogramRows(metrics, track)),
    [],
    ["Composición", "Grupo", "Valor", "Cantidad"],
    ...Object.entries(metrics.composicion.eneagrama).map(([key, value]) => [
      "eneagrama",
      protectCsvCell(key),
      String(value),
    ]),
    ...Object.entries(metrics.composicion.marcas).map(([key, value]) => ["marcas", protectCsvCell(markWord(key)), String(value)]),
    ...metrics.composicion.modulos.map((row) => ["módulos", moduleLabel(row.n), String(row.total)]),
    [],
    ["Contadores manuales", "Clave", "Valor", "Actualizado", "Por"],
    ...metrics.contadores.map((counter) => [
      protectCsvCell(counter.key),
      String(counter.value),
      counter.actualizadoEn,
      protectCsvCell(counter.actualizadoPor ?? "—"),
    ]),
    [],
    ["Auditoría", "Acción", "Cantidad"],
    ...Object.entries(metrics.auditoria.porAccion)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([action, value]) => [protectCsvCell(actionWord(action)), String(value)]),
    [],
    ["Auditoría por día", "Día", "Acciones"],
    ...metrics.auditoria.porDia.map((row) => [row.day, String(row.n)]),
  ];
  return BOM + rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}

/** Percentage of profiles that hold at least one match on a given track. */
export function trackCoverageRate(usersWithMatch: number, totalProfiles: number): number {
  if (totalProfiles <= 0) return 0;
  return Math.min(100, (usersWithMatch / totalProfiles) * 100);
}

/**
 * `value` expressed per hundred of `base`: the manual tallies count pairs, and
 * a pair involves two people, so a percentage of accounts would be a category
 * error. `null` when there is no base to divide by — an empty sky has no
 * density, which is not the same as a density of zero.
 */
export function perHundred(value: number, base: number): number | null {
  if (base <= 0) return null;
  return (100 * value) / base;
}
