/**
 * Fase 4 — "la revelación se ve exactamente una vez".
 *
 * The flag lives in the stored identity row, so it survives a closed tab, a
 * reinstall and a re-login: the person sees the hatch animation the first time
 * and the plain identity card every time afterwards. Marking it is idempotent,
 * so a double tap or two devices racing cost one write and no second view.
 */
import { err, ok, type Result } from "@/domain/shared";

import type { AppError } from "./errors";
import type { ProfileRepository } from "./ports";

export interface RevelationDeps {
  profiles: Pick<ProfileRepository, "identityState" | "markRevealed">;
}

export interface RevelationDto {
  /** True when this call is the one that consumed the reveal. */
  justRevealed: boolean;
  estadoIdentidad: "huevo" | "eclosionado";
}

/** Marks the reveal seen and reports whether it was the first time. */
export async function markIdentityRevealed(
  userId: string,
  deps: RevelationDeps,
): Promise<Result<RevelationDto, AppError>> {
  const current = await deps.profiles.identityState(userId);
  if (!current.ok) return current;
  if (!current.value) return err("quiz.not_completed");
  const firstTime = await deps.profiles.markRevealed(userId);
  if (!firstTime.ok) return firstTime;
  return ok({ justRevealed: firstTime.value, estadoIdentidad: current.value.estadoIdentidad });
}
