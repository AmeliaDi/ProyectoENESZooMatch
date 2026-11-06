/**
 * Admin dashboard contract. Only aggregate values are modelled (no
 * matrículas, hashes, vectors or raw answers); the RPC payload is validated
 * on the server and again on the client before it reaches the UI or CSV.
 */
import { z } from "zod";

const count = z.number().int().min(0);

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
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

/** @returns the parsed metrics, or `null` when the payload is not trustworthy. */
export function parseAdminMetrics(raw: unknown): AdminMetrics | null {
  const result = adminMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
