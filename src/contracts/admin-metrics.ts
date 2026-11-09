/**
 * Admin dashboard contract. Only aggregate values are modelled (no
 * matrículas, hashes, vectors or raw answers); the RPC payload is validated
 * on the server and again on the client before it reaches the UI or CSV.
 *
 * Every section the extended observatory adds carries a `default`, so a
 * payload from the old two-argument RPC still parses: the panels then see an
 * empty series and zeroed funnel instead of throwing. `ventanaDias: 0` is the
 * signal that the extended sections were not served.
 */
import { z } from "zod";

const count = z.number().int().min(0);
const isoDate = z.string().min(1);
/** A UTC day label, as the RPC casts it: `2026-11-08`. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A similarity or calibrated cut: cosine over personality vectors, [0, 1]. */
const ratio = z.number().min(0).max(1);

/**
 * One cell of an avatar breakdown. `id` is the stored catalogue id the count
 * groups by — hatched people only, since an egg has no animal or colour — and
 * `name` is the catalogue word shown beside it.
 */
const aggregateSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(64),
  count,
});

/** One day of the activity series. `pausas` and `bajas` are state, not history. */
export const metricsPointSchema = z.object({
  day,
  altas: count,
  encuestas: count,
  eclosiones: count,
  pausas: count,
  bajas: count,
});
export type MetricsPoint = z.infer<typeof metricsPointSchema>;

/** Participation funnel; every step counts people still in the sky. */
export const funnelSchema = z.object({
  registradas: count,
  conEncuesta: count,
  eclosionados: count,
  presentes: count,
  conRomance: count,
  conAmistad: count,
});
export type Funnel = z.infer<typeof funnelSchema>;

/** Hours from sign-up to hatching. Null when the sample is empty. */
export const hatchDelaySchema = z.object({
  medianaHoras: z.number().min(0).nullable(),
  p75Horas: z.number().min(0).nullable(),
  muestra: count,
});
export type HatchDelay = z.infer<typeof hatchDelaySchema>;

/**
 * One histogram box over the normalized axis. `i` is the box index — 12 boxes
 * of 0.25, so `i = 0` sits on the track's own threshold and `i = 4` on its
 * `reference_high` — and `n` how many live pairs fall in it.
 */
export const histogramBinSchema = z.object({ i: count.max(11), n: count });
export type HistogramBin = z.infer<typeof histogramBinSchema>;

/**
 * Quality of one track over the pairs a person can still open. `filas` counts
 * every live pair, `bajoUmbral` those under the cut and `sobreEje` the ones
 * past the last box, so `filas = bajoUmbral + Σ bins.n + sobreEje` always.
 * The percentiles are null on an empty pool, never 0.
 */
export const trackQualitySchema = z.object({
  filas: count,
  conAfinidad: count,
  aislados: count,
  media: ratio.nullable(),
  p50: ratio.nullable(),
  p90: ratio.nullable(),
  max: ratio.nullable(),
  bajoUmbral: count,
  bins: z.array(histogramBinSchema).max(12),
  sobreEje: count,
});
export type TrackQuality = z.infer<typeof trackQualitySchema>;

/** Composition of the sky: eggs have none of these columns, so they are absent. */
export const compositionSchema = z.object({
  eneagrama: z.record(z.string(), count),
  marcas: z.record(z.string(), count),
  modulos: z.array(z.object({ n: count, total: count })),
});
export type Composition = z.infer<typeof compositionSchema>;

/**
 * A hand-kept tally of relationships that actually happened. `key` matches the
 * stored CHECK; `actualizadoPor` is the admin's saved alias, `null` once their
 * account is gone — the number stays, the name does not.
 */
export const adminCounterSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  value: count,
  actualizadoEn: isoDate,
  actualizadoPor: z.string().nullable(),
});
export type AdminCounter = z.infer<typeof adminCounterSchema>;

export const auditSummarySchema = z.object({
  total: count,
  /** Action name → count. Unknown actions stay valid: SQL owns the list. */
  porAccion: z.record(z.string(), count),
  porDia: z.array(z.object({ day, n: count })),
});
export type AuditSummary = z.infer<typeof auditSummarySchema>;

const EMPTY_FUNNEL: Funnel = {
  registradas: 0, conEncuesta: 0, eclosionados: 0, presentes: 0, conRomance: 0, conAmistad: 0,
};
const EMPTY_TRACK: TrackQuality = {
  filas: 0, conAfinidad: 0, aislados: 0, media: null, p50: null, p90: null, max: null,
  bajoUmbral: 0, bins: [], sobreEje: 0,
};
const EMPTY_HATCH: HatchDelay = { medianaHoras: null, p75Horas: null, muestra: 0 };
const EMPTY_COMPOSITION: Composition = { eneagrama: {}, marcas: {}, modulos: [] };
const EMPTY_AUDIT: AuditSummary = { total: 0, porAccion: {}, porDia: [] };

export const adminMetricsSchema = z.object({
  generatedAt: z.string(),
  // Calibrated thresholds may sit below 0.5 (amistad ≈ 0.46); only [0, 1) is a contract.
  romanceThreshold: z.number().min(0).lt(1),
  amistadThreshold: z.number().min(0).lt(1),
  totalProfiles: count,
  romanceMatches: count,
  amistadMatches: count,
  usersWithRomanceMatch: count,
  usersWithAmistadMatch: count,
  /** People whose identity is not fixed yet; counted, never named. */
  huevos: count,
  topAnimals: z.array(aggregateSchema).max(10),
  topColors: z.array(aggregateSchema).max(10),
  mbtiDistribution: z.record(z.string(), count),

  // ── Observatorio ampliado ────────────────────────────────────────────────
  /** `reference_high` per track, the denominator of the normalized axis. */
  referencias: z.object({ romance: ratio.nullable(), amistad: ratio.nullable() }).default({ romance: null, amistad: null }),
  /** Days the series covers, after the 1..120 clamp. `0` = not served. */
  ventanaDias: count.max(120).default(0),
  desde: day.nullable().default(null),
  hasta: day.nullable().default(null),
  series: z.array(metricsPointSchema).max(120).default([]),
  embudo: funnelSchema.default(EMPTY_FUNNEL),
  eclosion: hatchDelaySchema.default(EMPTY_HATCH),
  matching: z.object({ romance: trackQualitySchema.default(EMPTY_TRACK), amistad: trackQualitySchema.default(EMPTY_TRACK) }).default({
    romance: EMPTY_TRACK,
    amistad: EMPTY_TRACK,
  }),
  composicion: compositionSchema.default(EMPTY_COMPOSITION),
  contadores: z.array(adminCounterSchema).default([]),
  auditoria: auditSummarySchema.default(EMPTY_AUDIT),
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

/**
 * The payload with nothing in it: what a panel holds before the first read.
 * Living next to the schema, so a new section cannot be forgotten here and
 * arrive at the UI as `undefined`.
 */
export function emptyAdminMetrics(romanceThreshold: number, amistadThreshold: number): AdminMetrics {
  return adminMetricsSchema.parse({
    generatedAt: new Date(0).toISOString(),
    romanceThreshold,
    amistadThreshold,
    totalProfiles: 0,
    romanceMatches: 0,
    amistadMatches: 0,
    usersWithRomanceMatch: 0,
    usersWithAmistadMatch: 0,
    huevos: 0,
    topAnimals: [],
    topColors: [],
    mbtiDistribution: {},
  });
}

/** False while the console is reading the old payload: no series, no funnel. */
export function hasObservatory(metrics: AdminMetrics): boolean {
  return metrics.ventanaDias > 0;
}

/** @returns the parsed metrics, or `null` when the payload is not trustworthy. */
export function parseAdminMetrics(raw: unknown): AdminMetrics | null {
  const result = adminMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
