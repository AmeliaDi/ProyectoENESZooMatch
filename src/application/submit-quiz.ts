import { buildAvatarSpec } from "@/domain/avatars/avatar-spec";
import { MICROTEST_ITEMS, scoreQuiz, type GlobalMatch, type LatentScorer } from "@/domain/matching";
import { generateProfileIdentity } from "@/domain/identity/profile-generator";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";
import { generateWelcomeMessage } from "@/domain/messages/notification-copy";

import { err, ok, type Result } from "@/domain/shared";
import { completedModules } from "@/domain/psychometrics/modules";
import { QUIZ_MODULE_IDS, type QuizModuleId, type QuizSubmission, type ScoredProfile } from "@/types/microtest";

import type { QuizSubmittedDto } from "./dto";
import type { AppError } from "./errors";
import { avatarParams, enneagramLabel } from "./identity-readout";
import type { NotificationRepository, ProfileRepository, StoredAnswer } from "./ports";
import { recomputeMatches, type RecomputeDeps } from "./recompute-matches";

export interface SubmitQuizInput {
  userId: string;
  submission: QuizSubmission;
  inclusiveMode?: InclusiveMode | undefined;
}

export interface SubmitQuizDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<ProfileRepository, "isQuizCompleted" | "saveQuizResult" | "setInclusiveMode">;
  notifications: Pick<NotificationRepository, "notifyMatches" | "insertWelcome">;
  /** Bayesian GRM scorer (built server-side from the measurement parameters). */
  latentScorer: LatentScorer;
}

function flattenAnswers(submission: QuizSubmission): StoredAnswer[] {
  return [
    ...submission.likert.map((a) => ({ itemId: a.itemId, value: a.value })),
    ...submission.filters.map((a) => ({ itemId: a.itemId, selected: a.selected })),
  ];
}

const OPTIONAL_MODULES = QUIZ_MODULE_IDS.filter((id) => id !== "nucleo");

export function completedOf(answers: readonly StoredAnswer[]): QuizModuleId[] {
  const ids = new Set(answers.flatMap((a) => (a.value !== undefined ? [a.itemId] : [])));
  return completedModules(MICROTEST_ITEMS, OPTIONAL_MODULES, ids);
}

export function score(submission: QuizSubmission, latent: LatentScorer): ScoredProfile | null {
  try {
    return scoreQuiz(submission, MICROTEST_ITEMS, latent);
  } catch {
    return null;
  }
}


/** Users paired with `userId` in a freshly published match set. */
function counterpartsOf(userId: string, pairs: readonly GlobalMatch[]): string[] {
  const self = userId.toLowerCase();
  const others = new Set<string>();
  for (const pair of pairs) {
    if (pair.userA === self) others.add(pair.userB);
    else if (pair.userB === self) others.add(pair.userA);
  }
  others.delete(self);
  return [...others];
}

/** Notifications are cosmetic: failures never surface to the caller. */
async function notifyAll(
  deps: SubmitQuizDeps,
  userId: string,
  pairs: readonly GlobalMatch[],
): Promise<void> {
  const own = await deps.notifications.notifyMatches(userId);
  if (!own.ok) return;
  await Promise.all(counterpartsOf(userId, pairs).map((id) => deps.notifications.notifyMatches(id)));
}

/**
 * Scores, persists, republishes matches and notifies. Once the result is
 * stored the call succeeds even if recomputation or notifications fail;
 * `recomputePending` tells the client to retry the result view later.
 */
export async function submitQuiz(
  input: SubmitQuizInput,
  deps: SubmitQuizDeps,
): Promise<Result<QuizSubmittedDto, AppError>> {
  const scored = score(input.submission, deps.latentScorer);
  if (!scored) return err("request.invalid");

  const avatar = buildAvatarSpec(scored.latent, avatarParams());
  const identity = generateProfileIdentity(scored.normalizedScores, input.userId, avatar);
  const completed = await deps.profiles.isQuizCompleted(input.userId);
  const isFirstSubmission = completed.ok && !completed.value;

  const answers = flattenAnswers(input.submission);
  const saved = await deps.profiles.saveQuizResult({
    userId: input.userId,
    answers,
    scored,
    identity,
    completedModules: completedOf(answers),
  });
  if (!saved.ok) return saved;

  if (input.inclusiveMode) await deps.profiles.setInclusiveMode(input.userId, input.inclusiveMode);

  const recomputed = await recomputeMatches(deps);
  if (recomputed.ok) await notifyAll(deps, input.userId, recomputed.value);

  // Inserted after notifyMatches (which clears prior unread notifications) so it persists.
  if (isFirstSubmission) {
    const welcome = generateWelcomeMessage(identity.animalDiminutivo, identity.colorNombre);
    await deps.notifications.insertWelcome(input.userId, welcome, {
      animal: identity.animalId,
      color: identity.colorId,
    });
  }

  return ok({
    ok: true,
    recomputePending: !recomputed.ok,
    profile: {
      alias: identity.alias,
      animal: identity.animalId,
      color: identity.colorId,
      mark: identity.mark,
      narrative: identity.narrative,
      animalName: identity.animalDiminutivo,
      colorName: identity.colorNombre,
      mbtiCode: avatar.mbtiCode,
      enneagram: enneagramLabel(avatar),
    },
  });
}
