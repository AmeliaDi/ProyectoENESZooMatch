import { ok, type Result } from "@/domain/shared";

import type { AppError } from "./errors";
import type { PrivacyState, ProfileRepository } from "./ports";
import { recomputeMatches, type RecomputeDeps } from "./recompute-matches";

export interface PrivacyDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<ProfileRepository, "privacyState" | "setPaused" | "setShowAvatarDetail" | "deleteAccount">;
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
