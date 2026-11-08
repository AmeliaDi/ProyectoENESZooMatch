/**
 * Eclosión (Fases 3 y 4): el único camino que escribe una identidad.
 *
 * `hatchIdentity` es pura y determinista; este caso de uso sólo decide
 * *cuándo* se ejecuta (núcleo obligatorio completo), le pasa el conjunto de
 * aliases ya ocupados para saltar colisiones y reintenta con el siguiente
 * sufijo si el índice único pierde una carrera. Nunca recalcula un animal ni
 * un color de alguien que ya eclosionó.
 *
 * Fase 1: usa `isCoreComplete` (fuente única), registra eventos estructurados
 * y reintenta fallos transitorios de almacenamiento con backoff exponencial.
 */

import { CATALOG } from "@/config";
import { MICROTEST_ITEMS } from "@/domain/matching";
import { isCoreComplete } from "@/domain/psychometrics/core-complete";
import { hatchIdentity, type HatchedIdentity } from "@/domain/identity/hatch-identity";
import { err, ok, type Result } from "@/domain/shared";
import type { Hmac } from "@/domain/shared";
import { logServerEvent } from "@/domain/shared/log";

import type { AppError } from "./errors";
import type { HatchOutcome, IdentityRecord, OwnProfile, ProfileRepository, Scheduler, StoredAnswer } from "./ports";

export interface HatchDeps {
  profiles: Pick<
    ProfileRepository,
    "findOwn" | "identityState" | "writeIdentity" | "listAliases" | "loadAnswers"
  >;
  /** `HMAC(secreto_servidor, …)` es la única semilla del sufijo y de los empates. */
  secret: string | Hmac;
  scheduler?: Scheduler;
}

export interface HatchResult {
  identity: IdentityRecord;
  outcome: HatchOutcome["outcome"];
  /** Present only when the egg cannot hatch yet: exactly which items are missing. */
  missingItemIds?: readonly string[];
}

/** Extra alias rounds to settle an unlikely simultaneous hatch on the same suffix. */
const MAX_HATCH_ROUNDS = 4;
/** Transient storage retries (Supabase timeout, network blip). */
const MAX_STORAGE_RETRIES = 3;
const BACKOFF_BASE_MS = 100;
const BACKOFF_MAX_MS = 800;

const answeredIds = (answers: readonly StoredAnswer[]): Set<string> =>
  new Set(answers.filter((a) => a.value !== undefined).map((a) => a.itemId));

function storageBackoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

/** Pure identity of a profile that has not hatched yet, skipping taken aliases. */
export function identityOf(
  userId: string,
  own: Pick<OwnProfile, "latent" | "normalizedScores">,
  secret: string | Hmac,
  existingAliases: ReadonlySet<string>,
): HatchedIdentity {
  if (!own.latent) throw new Error("identityOf needs a scored latent profile");
  return hatchIdentity(
    { userId, latent: own.latent, normalizedScores: own.normalizedScores ?? undefined },
    secret,
    CATALOG,
    { existingAliases },
  );
}

/** Writes it once, retrying deterministically while the alias is taken. */
export async function hatchProfile(
  userId: string,
  own: Pick<OwnProfile, "latent" | "normalizedScores">,
  deps: HatchDeps,
): Promise<Result<HatchResult, AppError>> {
  if (!own.latent) {
    logServerEvent("warn", "hatch.no_latent", { userId: userId.slice(0, 8) });
    return err("quiz.not_completed");
  }
  let last: HatchOutcome | null = null;

  for (let round = 0; round < MAX_HATCH_ROUNDS; round += 1) {
    const aliases = await deps.profiles.listAliases();
    if (!aliases.ok) return aliases;
    let hatch: HatchedIdentity;
    try {
      hatch = identityOf(userId, own, deps.secret, new Set(aliases.value));
    } catch {
      logServerEvent("error", "hatch.suffix_exhausted", { round });
      return err("match.pool_unstable");
    }
    const written = await deps.profiles.writeIdentity(userId, hatch);
    if (!written.ok) return written;
    last = written.value;
    if (last.outcome !== "collision") break;
    logServerEvent("info", "hatch.alias_collision", { round });
  }

  if (!last || last.outcome === "collision") return err("match.pool_unstable");
  logServerEvent("info", "hatch.written", { outcome: last.outcome });
  return readIdentity(userId, deps, last.outcome);
}

/**
 * Identity of a person, hatching first when the mandatory core is already
 * answered but the row is still an egg (submission lost mid-flight, the deploy
 * window, or a profile the backfill could not freeze).
 *
 * Retries transient storage failures with exponential backoff. Logs every
 * self-repair attempt so the reconciler can distinguish "never triggered"
 * from "triggered but failed".
 */
export async function ensureIdentity(
  userId: string,
  deps: HatchDeps,
): Promise<Result<HatchResult, AppError>> {
  const scheduler = deps.scheduler;

  for (let attempt = 0; attempt <= MAX_STORAGE_RETRIES; attempt += 1) {
    const current = await deps.profiles.identityState(userId);
    if (!current.ok) {
      if (attempt < MAX_STORAGE_RETRIES && scheduler) {
        logServerEvent("warn", "hatch.self_repair_retry", { attempt, error: current.error });
        await scheduler.sleep(storageBackoffMs(attempt));
        continue;
      }
      return current;
    }
    if (!current.value) return err("quiz.not_completed");
    if (current.value.estadoIdentidad === "eclosionado") {
      return ok({ identity: current.value, outcome: "already" });
    }

    const answers = await deps.profiles.loadAnswers(userId);
    if (!answers.ok) {
      if (attempt < MAX_STORAGE_RETRIES && scheduler) {
        logServerEvent("warn", "hatch.self_repair_retry", { attempt, error: answers.error });
        await scheduler.sleep(storageBackoffMs(attempt));
        continue;
      }
      return answers;
    }

    const core = isCoreComplete(MICROTEST_ITEMS, answeredIds(answers.value));
    if (!core.complete) {
      return ok({ identity: current.value, outcome: "already", missingItemIds: core.missingItemIds });
    }

    const own = await deps.profiles.findOwn(userId);
    if (!own.ok) {
      if (attempt < MAX_STORAGE_RETRIES && scheduler) {
        logServerEvent("warn", "hatch.self_repair_retry", { attempt, error: own.error });
        await scheduler.sleep(storageBackoffMs(attempt));
        continue;
      }
      return own;
    }
    if (!own.value) return err("quiz.not_completed");

    logServerEvent("info", "hatch.self_repair_attempt", { missing: core.missingItemIds.length });
    const result = await hatchProfile(userId, own.value, deps);
    if (!result.ok && attempt < MAX_STORAGE_RETRIES && scheduler) {
      logServerEvent("warn", "hatch.self_repair_failed", { attempt, error: result.error });
      await scheduler.sleep(storageBackoffMs(attempt));
      continue;
    }
    if (result.ok) {
      logServerEvent("info", "hatch.self_repair_success", { outcome: result.value.outcome });
    }
    return result;
  }

  return err("storage.failed");
}

async function readIdentity(
  userId: string,
  deps: HatchDeps,
  outcome: HatchOutcome["outcome"],
): Promise<Result<HatchResult, AppError>> {
  const identity = await deps.profiles.identityState(userId);
  if (!identity.ok) return identity;
  if (!identity.value) return err("quiz.not_completed");
  return ok({ identity: identity.value, outcome });
}
