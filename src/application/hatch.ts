/**
 * Eclosión (Fases 3 y 4): el único camino que escribe una identidad.
 *
 * `hatchIdentity` es pura y determinista; este caso de uso sólo decide
 * *cuándo* se ejecuta (núcleo obligatorio completo), le pasa el conjunto de
 * aliases ya ocupados para saltar colisiones y reintenta con el siguiente
 * sufijo si el índice único pierde una carrera. Nunca recalcula un animal ni
 * un color de alguien que ya eclosionó.
 */

import { CATALOG } from "@/config";
import { MICROTEST_ITEMS } from "@/domain/matching";
import { hatchConditionMet } from "@/domain/identity/hatch-condition";
import { hatchIdentity, type HatchedIdentity } from "@/domain/identity/hatch-identity";
import { err, ok, type Result } from "@/domain/shared";
import type { Hmac } from "@/domain/shared";

import type { AppError } from "./errors";
import type { HatchOutcome, IdentityRecord, OwnProfile, ProfileRepository, StoredAnswer } from "./ports";

export interface HatchDeps {
  profiles: Pick<
    ProfileRepository,
    "findOwn" | "identityState" | "writeIdentity" | "listAliases" | "loadAnswers"
  >;
  /** `HMAC(secreto_servidor, …)` es la única semilla del sufijo y de los empates. */
  secret: string | Hmac;
}

export interface HatchResult {
  identity: IdentityRecord;
  outcome: HatchOutcome["outcome"];
}

/** Extra alias rounds to settle an unlikely simultaneous hatch on the same suffix. */
const MAX_HATCH_ROUNDS = 4;

const answeredIds = (answers: readonly StoredAnswer[]): Set<string> =>
  new Set(answers.filter((a) => a.value !== undefined).map((a) => a.itemId));

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
  if (!own.latent) return err("quiz.not_completed");
  let last: HatchOutcome | null = null;

  for (let round = 0; round < MAX_HATCH_ROUNDS; round += 1) {
    const aliases = await deps.profiles.listAliases();
    if (!aliases.ok) return aliases;
    let hatch: HatchedIdentity;
    try {
      hatch = identityOf(userId, own, deps.secret, new Set(aliases.value));
    } catch {
      // No free suffix left in the deterministic range: nothing is written and
      // the next call starts over. `hatchIdentity` never renames anybody.
      return err("match.pool_unstable");
    }
    const written = await deps.profiles.writeIdentity(userId, hatch);
    if (!written.ok) return written;
    last = written.value;
    if (last.outcome !== "collision") break;
  }

  // Sin espacio de sufijos libres tras todos los reintentos: la pool está
  // inestable y la siguiente llamada reintentará desde cero.
  if (!last || last.outcome === "collision") return err("match.pool_unstable");
  return readIdentity(userId, deps, last.outcome);
}

/**
 * Identity of a person, hatching first when the mandatory core is already
 * answered but the row is still an egg (submission lost mid-flight, the deploy
 * window, or a profile the fase 6 backfill could not freeze).
 */
export async function ensureIdentity(
  userId: string,
  deps: HatchDeps,
): Promise<Result<HatchResult, AppError>> {
  const current = await deps.profiles.identityState(userId);
  if (!current.ok) return current;
  if (!current.value) return err("quiz.not_completed");
  if (current.value.estadoIdentidad === "eclosionado") {
    return ok({ identity: current.value, outcome: "already" });
  }

  const answers = await deps.profiles.loadAnswers(userId);
  if (!answers.ok) return answers;
  if (!hatchConditionMet(MICROTEST_ITEMS, answeredIds(answers.value))) {
    return ok({ identity: current.value, outcome: "already" });
  }

  const own = await deps.profiles.findOwn(userId);
  if (!own.ok) return own;
  if (!own.value) return err("quiz.not_completed");
  return hatchProfile(userId, own.value, deps);
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
