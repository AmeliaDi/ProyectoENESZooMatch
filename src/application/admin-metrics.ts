import { ADMIN_CONFIG } from "@/config";
import { getAmistadReference, getAmistadThreshold, getRomanceReference, getRomanceThreshold } from "@/domain/matching";
import { err, ok, type Result } from "@/domain/shared";

import { parseAdminMetrics, type AdminMetrics } from "@/contracts/admin-metrics";
import type { AppError } from "./errors";
import type { AdminRepository } from "./ports";

/** Fills optional aggregate collections the RPC may omit on an empty pool. */
function normalizeAggregates(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const payload = raw as Record<string, unknown>;
  const distribution = payload.mbtiDistribution;
  return {
    ...payload,
    topAnimals: Array.isArray(payload.topAnimals) ? payload.topAnimals : [],
    topColors: Array.isArray(payload.topColors) ? payload.topColors : [],
    mbtiDistribution:
      distribution && typeof distribution === "object" && !Array.isArray(distribution)
        ? distribution
        : {},
  };
}

/**
 * The window a read of the observatory covers. Only the lengths the console
 * offers are honoured: a hand-typed `?days=100000` would otherwise ask the
 * base for a century of daily rows, and the SQL floor is a backstop, not the
 * place where the choice belongs.
 */
export function windowDays(requested: number | null | undefined): number {
  const { windowsDays, defaultWindowDays } = ADMIN_CONFIG.metrics;
  return requested !== null && requested !== undefined && windowsDays.includes(requested)
    ? requested
    : defaultWindowDays;
}

/**
 * One read of the whole observatory. The four similarity anchors travel with
 * it because the histograms are normalised against them: they are the values
 * the running matcher uses, never numbers a chart invented.
 */
export async function loadAdminMetrics(
  repo: Pick<AdminRepository, "loadDashboard">,
  days?: number | null,
): Promise<Result<AdminMetrics, AppError>> {
  const raw = await repo.loadDashboard({
    romance: getRomanceThreshold(),
    amistad: getAmistadThreshold(),
    romanceReference: getRomanceReference(),
    amistadReference: getAmistadReference(),
    windowDays: windowDays(days),
  });
  if (!raw.ok) return raw;
  const metrics = parseAdminMetrics(normalizeAggregates(raw.value));
  return metrics ? ok(metrics) : err("service.unavailable");
}
