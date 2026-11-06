import { MICROTEST_ITEMS, scoreQuiz, type GlobalMatch, type LatentScorer } from "@/domain/matching";
import { generateStoredNarrative } from "@/domain/identity/profile-generator";
import { formatIdentity } from "@/domain/identity/format-identity";
import { hatchConditionMet, identityRequirements } from "@/domain/identity/hatch-condition";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";
import { generateWelcomeMessage } from "@/domain/messages/notification-copy";

import { err, fnv1a32, ok, type Hmac, type Result } from "@/domain/shared";
import { completedModules } from "@/domain/psychometrics/modules";
import { QUIZ_MODULE_IDS, type QuizModuleId, type QuizSubmission, type ScoredProfile } from "@/types/microtest";

import type { QuizSubmittedDto } from "./dto";
import type { AppError } from "./errors";
import { identityOf } from "./hatch";
import { EGG_IDENTITY_DTO, toIdentityDto } from "./identity-dto";
import type { HatchedIdentity } from "@/domain/identity/hatch-identity";
import type { IdentityRecord, NotificationRepository, ProfileRepository, StoredAnswer } from "./ports";
import { recomputeMatches, type RecomputeDeps } from "./recompute-matches";

export interface SubmitQuizInput {
  userId: string;
  submission: QuizSubmission;
  inclusiveMode?: InclusiveMode | undefined;
  clientKey?: string | undefined;
}

export interface SubmitQuizDeps extends RecomputeDeps {
  profiles: RecomputeDeps["profiles"] &
    Pick<
      ProfileRepository,
      "isQuizCompleted" | "saveQuizResult" | "setInclusiveMode" | "identityState" | "listAliases"
    >;
  notifications: Pick<NotificationRepository, "notifyMatches" | "insertWelcome">;
  /** Bayesian GRM scorer (built server-side from the measurement parameters). */
  latentScorer: LatentScorer;
  /** `HMAC(secreto_servidor, …)`: the only seed of the suffix and of the ties. */
  secret: string | Hmac;
}

function flattenAnswers(submission: QuizSubmission): StoredAnswer[] {
  return [
    ...submission.likert.map((a) => ({ itemId: a.itemId, value: a.value })),
    ...submission.filters.map((a) => ({ itemId: a.itemId, selected: a.selected })),
  ];
}

const OPTIONAL_MODULES = QUIZ_MODULE_IDS.filter((id) => id !== "nucleo");

/** What the API answers when a submission did not hatch: no identity at all. */
function eggProfile(progressPercent: number): QuizSubmittedDto["profile"] {
  return {
    identity: EGG_IDENTITY_DTO,
    narrative: "",
    mbtiCode: "",
    enneagram: { code: "—", nombre: "En exploración", arquetipo: "Tu eneagrama aún no se define", exploring: true },
    progressPercent,
  };
}

/** Core completion in %, the only number the egg screens and crack stages read. */
export function coreProgressPercent(answers: readonly StoredAnswer[]): number {
  const requirements = identityRequirements(MICROTEST_ITEMS, answeredOf(answers));
  if (requirements.totalRequired === 0) return 0;
  return Math.round((100 * requirements.answeredRequired) / requirements.totalRequired);
}

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

/** Extra alias rounds to settle an unlikely simultaneous hatch on the same suffix. */
const MAX_HATCH_ROUNDS = 4;

const answeredOf = (answers: readonly StoredAnswer[]): Set<string> =>
  new Set(answers.filter((a) => a.value !== undefined).map((a) => a.itemId));

async function executeSubmitQuiz(
  input: SubmitQuizInput,
  deps: SubmitQuizDeps,
): Promise<Result<QuizSubmittedDto, AppError>> {
  const scored = score(input.submission, deps.latentScorer);
  if (!scored) return err("request.invalid");

  const answers = flattenAnswers(input.submission);
  const before = await deps.profiles.identityState(input.userId);
  if (!before.ok) return before;
  const stored = before.value;
  const isEgg = stored === null || stored.estadoIdentidad === "huevo";
  /** Only a still-unhatched person whose mandatory core is answered hatches now. */
  const willHatch = isEgg && hatchConditionMet(MICROTEST_ITEMS, answeredOf(answers));

  const completed = await deps.profiles.isQuizCompleted(input.userId);
  const isFirstSubmission = completed.ok && !completed.value;

  const saved = await writeSubmission(input.userId, scored, answers, willHatch, narrativeOf(stored, scored), deps);
  if (!saved.ok) return saved;

  if (input.inclusiveMode) await deps.profiles.setInclusiveMode(input.userId, input.inclusiveMode);

  const recomputed = await recomputeMatches(deps);
  if (recomputed.ok) await notifyAll(deps, input.userId, recomputed.value);

  // The identity is read back after the write: the stored row is the
  // authority, not whatever this request proposed. A person who already
  // hatched keeps exactly the name they have always had.
  const after = await deps.profiles.identityState(input.userId);
  if (!after.ok) return after;
  const record = after.value;
  if (!record || record.estadoIdentidad !== "eclosionado") {
    return ok({ ok: true, recomputePending: !recomputed.ok, profile: eggProfile(coreProgressPercent(answers)) });
  }
  const identity = toIdentityDto(record);

  // Inserted after notifyMatches (which clears prior unread notifications) so it persists.
  if (isFirstSubmission) {
    const welcome = generateWelcomeMessage(formatIdentity(identity).title);
    await deps.notifications.insertWelcome(input.userId, welcome, {
      animal: identity.animalId ?? "",
      color: identity.colorId ?? "",
    });
  }

  return ok({
    ok: true,
    recomputePending: !recomputed.ok,
    profile: {
      identity,
      narrative: record.narrative ?? "",
      mbtiCode: identity.mbtiCode ?? "",
      enneagram: {
        code: identity.enneagramCode ?? "—",
        nombre: identity.enneagramName ?? "En exploración",
        arquetipo: identity.enneagramName ?? "Tu eneagrama aún no se define",
        exploring: identity.enneagramCode === null,
      },
      progressPercent: coreProgressPercent(answers),
    },
  });
}

/**
 * The reading text. At hatching it is the hatch's own; afterwards optional
 * modules may refresh it from the stored catalogue ids. It is never a name.
 */
function narrativeOf(stored: IdentityRecord | null, scored: ScoredProfile): string | null {
  if (!stored || stored.estadoIdentidad === "huevo") return null;
  if (stored.animalId === null || stored.colorId === null) return null;
  return generateStoredNarrative(stored.animalId, stored.colorId, scored.normalizedScores);
}

/**
 * Writes the scoring and, for a first complete core, the hatch inside the same
 * RPC call (one transaction). A lost alias race retries with the next
 * deterministic suffix; nobody already named is ever renamed.
 */
async function writeSubmission(
  userId: string,
  scored: ScoredProfile,
  answers: readonly StoredAnswer[],
  willHatch: boolean,
  narrative: string | null,
  deps: SubmitQuizDeps,
): Promise<Result<true, AppError>> {
  const rounds = willHatch ? MAX_HATCH_ROUNDS : 1;
  for (let round = 0; round < rounds; round += 1) {
    let hatch: HatchedIdentity | undefined;
    if (willHatch) {
      const aliases = await deps.profiles.listAliases();
      if (!aliases.ok) return aliases;
      try {
        hatch = identityOf(userId, { latent: scored.latent, normalizedScores: scored.normalizedScores }, deps.secret, new Set(aliases.value));
      } catch {
        return err("match.pool_unstable");
      }
    }
    const saved = await deps.profiles.saveQuizResult({
      userId,
      answers,
      scored,
      narrative: hatch ? hatch.narrative : narrative,
      hatch,
      completedModules: completedOf(answers),
    });
    if (!saved.ok) return saved;
    if (saved.value.outcome !== "collision") return ok(true);
  }
  return err("match.pool_unstable");
}
