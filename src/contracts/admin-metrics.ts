/**
 * Admin dashboard contract. Only aggregate values are modelled (no
 * matrículas, hashes, vectors or raw answers); the RPC payload is validated
 * on the server and again on the client before it reaches the UI or CSV.
 */
import { z } from "zod";

export const adminMetricsSchema = z.object({
  generatedAt: z.string(),
  // Calibrated thresholds may sit below 0.5 (amistad ≈ 0.46); only [0, 1) is a contract.
  romanceThreshold: z.number().min(0).lt(1),
  amistadThreshold: z.number().min(0).lt(1),
  totalProfiles: z.number().int().min(0),
  romanceMatches: z.number().int().min(0),
  amistadMatches: z.number().int().min(0),
  usersWithRomanceMatch: z.number().int().min(0),
  usersWithAmistadMatch: z.number().int().min(0),
  topAnimals: z.array(z.object({ animal: z.string(), count: z.number() })).max(10),
  topColors: z.array(z.object({ color: z.string(), count: z.number() })).max(10),
  mbtiDistribution: z.record(z.string(), z.number()),
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

/** @returns the parsed metrics, or `null` when the payload is not trustworthy. */
export function parseAdminMetrics(raw: unknown): AdminMetrics | null {
  const result = adminMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
