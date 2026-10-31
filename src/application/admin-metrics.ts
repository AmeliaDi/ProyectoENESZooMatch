import { getAmistadThreshold, getRomanceThreshold } from "@/domain/matching";
import { err, ok, type Result } from "@/domain/shared";

import { parseAdminMetrics, type AdminMetrics } from "./admin/dashboard";
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

export async function loadAdminMetrics(
  repo: Pick<AdminRepository, "loadDashboard">,
): Promise<Result<AdminMetrics, AppError>> {
  const raw = await repo.loadDashboard({
    romance: getRomanceThreshold(),
    amistad: getAmistadThreshold(),
  });
  if (!raw.ok) return raw;
  const metrics = parseAdminMetrics(normalizeAggregates(raw.value));
  return metrics ? ok(metrics) : err("service.unavailable");
}
