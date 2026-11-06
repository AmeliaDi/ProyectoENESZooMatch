import { buildAvatarSpec } from "@/domain/avatars/avatar-spec";
import { MICROTEST_ITEMS, scoreQuiz, type GlobalMatch, type LatentScorer } from "@/domain/matching";
import { generateProfileIdentity } from "@/domain/identity/profile-generator";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";
import { generateWelcomeMessage } from "@/domain/messages/notification-copy";

import { err, fnv1a32, ok, type Result } from "@/domain/shared";
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
  clientKey?: string | undefined;
  preserveColor?: boolean | undefined;
}

export interface SubmitQuizDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<ProfileRepository, "isQuizCompleted" | "saveQuizResult" | "setInclusiveMode"> &
    Partial<Pick<ProfileRepository, "findOwn">>;
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

const CLIENT_KEY_CACHE_MAX = 256;
const CLIENT_KEY_TTL_MS = 5 * 60 * 1000;

const inFlightBySubmissionKey = new Map<string, Promise<Result<QuizSubmittedDto, AppError>>>();
const completedByClientKey = new WeakMap<
  SubmitQuizDeps["profiles"],
  Map<string, { at: number; value: QuizSubmittedDto }>
>();

function submissionFingerprint(submission: QuizSubmission): string {
  const likert = [...submission.likert]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((a) => `${a.itemId}=${a.value}`)
    .join("&");
  const filters = [...submission.filters]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((a) => `${a.itemId}=${[...a.selected].sort().join(",")}`)
    .join("&");
  return fnv1a32(`${likert}|${filters}`).toString(36);
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
  const normalizedKey = input.clientKey?.trim();
  const fp = submissionFingerprint(input.submission);
  const clientScopeKey = normalizedKey ? `${input.userId}:${normalizedKey}:${fp}` : null;

  if (clientScopeKey) {
    const repoCache = completedByClientKey.get(deps.profiles);
    const cached = repoCache?.get(clientScopeKey);
    if (cached && Date.now() - cached.at < CLIENT_KEY_TTL_MS) {
      return ok(cached.value);
    }
  }

  const inFlightKey = `${input.userId}:${normalizedKey ?? fp}`;
  const existingInFlight = inFlightBySubmissionKey.get(inFlightKey);
  if (existingInFlight) return existingInFlight;

  const execution = executeSubmitQuiz(input, deps).then((result) => {
    if (result.ok && clientScopeKey) {
      let repoCache = completedByClientKey.get(deps.profiles);
      if (!repoCache) {
        repoCache = new Map();
        completedByClientKey.set(deps.profiles, repoCache);
      }
      if (repoCache.size >= CLIENT_KEY_CACHE_MAX) {
        const oldest = repoCache.keys().next().value;
        if (oldest !== undefined) repoCache.delete(oldest);
      }
      repoCache.set(clientScopeKey, { at: Date.now(), value: result.value });
    }
    return result;
  });

  inFlightBySubmissionKey.set(inFlightKey, execution);
  try {
    return await execution;
  } finally {
    inFlightBySubmissionKey.delete(inFlightKey);
  }
}

async function executeSubmitQuiz(
  input: SubmitQuizInput,
  deps: SubmitQuizDeps,
): Promise<Result<QuizSubmittedDto, AppError>> {
  const scored = score(input.submission, deps.latentScorer);
  if (!scored) return err("request.invalid");

  const computedAvatar = buildAvatarSpec(scored.latent, avatarParams(), input.userId);
  let effectiveColorId = computedAvatar.colorId;
  if (input.preserveColor && deps.profiles.findOwn) {
    const existing = await deps.profiles.findOwn(input.userId);
    if (existing.ok && existing.value?.color?.id) {
      effectiveColorId = existing.value.color.id;
    }
  }
  const avatar = { ...computedAvatar, colorId: effectiveColorId };
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
    preserveColor: input.preserveColor,
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
      alias: saved.value.alias,
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
