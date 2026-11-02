/**
 * "¿Quieres afinar tu perfil?": answers of ONE optional module are merged
 * with the stored answers and the whole profile is re-scored (the Bayesian
 * scorer narrows the posterior; nothing is imputed). Then it goes through the
 * same publish path as the full test. The animal may become more specific:
 * avatars are derived from the latent profile (docs/AVATARES.md).
 */
import { MICROTEST_ITEMS } from "@/domain/matching";
import { err, type Result } from "@/domain/shared";
import type { LikertValue, QuizModuleId, QuizSubmission } from "@/types/microtest";

import type { QuizSubmittedDto } from "./dto";
import type { AppError } from "./errors";
import type { ProfileRepository, StoredAnswer } from "./ports";
import { submitQuiz, type SubmitQuizDeps } from "./submit-quiz";

export interface RefineInput {
  userId: string;
  module: QuizModuleId;
  likert: ReadonlyArray<{ itemId: string; value: LikertValue }>;
}

export interface RefineDeps extends SubmitQuizDeps {
  profiles: SubmitQuizDeps["profiles"] & Pick<ProfileRepository, "loadAnswers">;
}

const MODULE_OF = new Map(MICROTEST_ITEMS.map((item) => [item.id, item.modulo]));
const isLikert = (v: number | undefined): v is LikertValue => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

/** Stored answers with the module's answers replacing any previous ones. */
export function mergeModule(stored: readonly StoredAnswer[], input: RefineInput): QuizSubmission | null {
  if (input.likert.some((a) => MODULE_OF.get(a.itemId) !== input.module)) return null;
  const fresh = new Set(input.likert.map((a) => a.itemId));
  const likert = stored.flatMap((a) => (isLikert(a.value) && !fresh.has(a.itemId) ? [{ itemId: a.itemId, value: a.value }] : []));
  const filters = stored.flatMap((a) => (a.selected ? [{ itemId: a.itemId, selected: [...a.selected] }] : []));
  return { likert: [...likert, ...input.likert], filters };
}

export async function refineProfile(input: RefineInput, deps: RefineDeps): Promise<Result<QuizSubmittedDto, AppError>> {
  const completed = await deps.profiles.isQuizCompleted(input.userId);
  if (!completed.ok) return completed;
  if (!completed.value) return err("quiz.not_completed");
  const stored = await deps.profiles.loadAnswers(input.userId);
  if (!stored.ok) return stored;
  const submission = mergeModule(stored.value, input);
  if (!submission) return err("request.invalid");
  return submitQuiz({ userId: input.userId, submission }, deps);
}
