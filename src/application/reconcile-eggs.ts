/**
 * Reconciliación periódica de huevos (Fase 1).
 *
 * Recorre todos los huevos activos, comprueba `isCoreComplete` y eclosiona
 * los que ya tienen el núcleo completo pero nunca se disparó (o falló) la
 * eclosión. Después recalcula matches y notifica. Idempotente: ejecutar dos
 * veces seguidas no cambia nada la segunda vez.
 *
 * Solo reporta conteos e ids seudónimos (primeros 8 chars). Nunca respuestas
 * ni matrículas.
 */
import { MICROTEST_ITEMS } from "@/domain/matching";
import { isCoreComplete } from "@/domain/psychometrics/core-complete";
import { ok, type Result } from "@/domain/shared";
import { logServerEvent } from "@/domain/shared/log";

import type { AppError } from "./errors";
import { ensureIdentity, type HatchDeps } from "./hatch";
import type { NotificationRepository, ProfileRepository, Scheduler, StoredAnswer } from "./ports";
import { recomputeMatches, type RecomputeDeps } from "./recompute-matches";

export interface ReconcileDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<ProfileRepository, "listEggUserIds" | "loadAnswers" | "identityState" | "findOwn" | "writeIdentity" | "listAliases">;
  notifications: Pick<NotificationRepository, "notifyMatches">;
  hatch: HatchDeps;
  scheduler: Scheduler;
}

export interface ReconcileSummary {
  eggsScanned: number;
  eligible: number;
  hatched: number;
  alreadyHatched: number;
  failed: number;
  notEligible: number;
  matchesRecomputed: boolean;
  notified: number;
}

const answeredIds = (answers: readonly StoredAnswer[]): Set<string> =>
  new Set(answers.filter((a) => a.value !== undefined).map((a) => a.itemId));

/**
 * Scans every active egg, hatches the eligible ones, recomputes the global
 * match set and notifies. Failures on individual eggs are logged and skipped
 * (the next run retries them); a storage failure on the pool scan aborts.
 */
export async function reconcileEggs(
  deps: ReconcileDeps,
): Promise<Result<ReconcileSummary, Extract<AppError, "storage.failed" | "service.unavailable">>> {
  const eggs = await deps.profiles.listEggUserIds();
  if (!eggs.ok) return eggs;

  const summary: ReconcileSummary = {
    eggsScanned: eggs.value.length,
    eligible: 0,
    hatched: 0,
    alreadyHatched: 0,
    failed: 0,
    notEligible: 0,
    matchesRecomputed: false,
    notified: 0,
  };

  const hatchedIds: string[] = [];

  for (const userId of eggs.value) {
    const answers = await deps.profiles.loadAnswers(userId);
    if (!answers.ok) {
      summary.failed += 1;
      logServerEvent("warn", "reconcile.load_answers_failed", { uid: userId.slice(0, 8) });
      continue;
    }

    const core = isCoreComplete(MICROTEST_ITEMS, answeredIds(answers.value));
    if (!core.complete) {
      summary.notEligible += 1;
      continue;
    }

    summary.eligible += 1;
    const result = await ensureIdentity(userId, deps.hatch);
    if (!result.ok) {
      summary.failed += 1;
      logServerEvent("error", "reconcile.hatch_failed", { uid: userId.slice(0, 8), error: result.error });
      continue;
    }

    if (result.value.outcome === "already" && result.value.identity.estadoIdentidad === "eclosionado") {
      summary.alreadyHatched += 1;
    } else if (result.value.identity.estadoIdentidad === "eclosionado") {
      summary.hatched += 1;
      hatchedIds.push(userId);
      logServerEvent("info", "reconcile.hatched", { uid: userId.slice(0, 8) });
    } else {
      summary.notEligible += 1;
    }
  }

  if (hatchedIds.length > 0) {
    const recomputed = await recomputeMatches(deps);
    summary.matchesRecomputed = recomputed.ok;
    if (recomputed.ok) {
      for (const userId of hatchedIds) {
        const notified = await deps.notifications.notifyMatches(userId);
        if (notified.ok) summary.notified += 1;
      }
    }
  }

  logServerEvent("info", "reconcile.complete", {
    scanned: summary.eggsScanned,
    eligible: summary.eligible,
    hatched: summary.hatched,
    failed: summary.failed,
    notEligible: summary.notEligible,
  });

  return ok(summary);
}