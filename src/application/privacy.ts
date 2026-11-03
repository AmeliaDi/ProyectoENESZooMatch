import { ok, type Result } from "@/domain/shared";
import { SHARE_LAYER_IDS, type ShareLayerId } from "@/types/sharing";

import type { AppError } from "./errors";
import type { PrivacyState, ProfileRepository } from "./ports";
import { recomputeMatches, type RecomputeDeps } from "./recompute-matches";

export interface PrivacyDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<ProfileRepository, "privacyState" | "setPaused" | "setShowAvatarDetail" | "setSharedLayers" | "deleteAccount">;
}

export interface PrivacyOutcome {
  paused: boolean;
  /** `true` when the shared match set could not be republished yet. */
  recomputePending: boolean;
}

/** Visual-only preference: no recomputation, matches do not change. */
export function setShowAvatarDetail(
  userId: string,
  show: boolean,
  deps: Pick<PrivacyDeps, "profiles">,
): Promise<Result<void, AppError>> {
  return deps.profiles.setShowAvatarDetail(userId, show);
}

/**
 * What others may see of your readings (ADR-030). Visual only: matches do not
 * change. Stored deduplicated and in canonical order.
 */
export async function setSharedLayers(
  userId: string,
  layers: readonly ShareLayerId[],
  deps: Pick<PrivacyDeps, "profiles">,
): Promise<Result<ShareLayerId[], AppError>> {
  const canonical = SHARE_LAYER_IDS.filter((id) => layers.includes(id));
  const saved = await deps.profiles.setSharedLayers(userId, canonical);
  return saved.ok ? ok(canonical) : saved;
}

export function getPrivacyState(
  userId: string,
  deps: Pick<PrivacyDeps, "profiles">,
): Promise<Result<PrivacyState, AppError>> {
  return deps.profiles.privacyState(userId);
}

/**
 * Pausing removes the profile from the pool, so the shared match set is
 * republished right away: nobody keeps seeing a paused person.
 */
export async function setProfilePaused(
  userId: string,
  paused: boolean,
  deps: PrivacyDeps,
): Promise<Result<PrivacyOutcome, AppError>> {
  const saved = await deps.profiles.setPaused(userId, paused);
  if (!saved.ok) return saved;
  const recomputed = await recomputeMatches(deps);
  return ok({ paused, recomputePending: !recomputed.ok });
}

/** Irreversible: deletes the account (rows cascade) and republishes matches. */
export async function deleteMyData(
  userId: string,
  deps: PrivacyDeps,
): Promise<Result<{ recomputePending: boolean }, AppError>> {
  const deleted = await deps.profiles.deleteAccount(userId);
  if (!deleted.ok) return deleted;
  const recomputed = await recomputeMatches(deps);
  return ok({ recomputePending: !recomputed.ok });
}
