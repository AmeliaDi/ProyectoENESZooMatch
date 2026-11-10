/**
 * In-memory `BadgeDeps` for the profile tests. The chat reads delegate to the
 * conversation store; the quiz side is a list of finished attempts, because
 * `quiz_attempts` keeps one row per quiz and that is all the grid counts.
 */
import type { StorageError } from "../errors";
import type { ConversationRepository } from "../chat/conversation-ports";
import type { BadgeDeps } from "../profile-badges";
import type { QuizRepository } from "../quiz/ports";
import { err, type Result } from "@/domain/shared";

export type QuizAttempt = Awaited<ReturnType<QuizRepository["getAttempts"]>>[number];

export function badgeAttempts(quizId: string, completadoEn: Date): QuizAttempt {
  return { quiz_id: quizId, revision: "1", completado_en: completadoEn };
}

/** One failed read for every read: a row list nobody asked for. */
const fail = async (): Promise<Result<never[], StorageError>> => err("storage.failed");

/** `broken` stands for an outage: the read path must then say nothing at all. */
export function memoryBadges(
  conversations: ConversationRepository,
  attempts: readonly QuizAttempt[] = [],
  now: () => Date = () => new Date(),
  broken = false,
): BadgeDeps {
  return {
    conversations: broken
      ? { listFor: fail, roundsOf: fail, answersOf: fail, recentMessagesBy: fail }
      : conversations,
    quizzes: broken
      ? { getAttempts: async () => { throw new Error("quiz.get_attempts failed"); } }
      : { getAttempts: async () => attempts.map((attempt) => ({ ...attempt })) },
    clock: { now },
  };
}
