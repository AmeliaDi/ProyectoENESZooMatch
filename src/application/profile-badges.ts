/**
 * The badge read path (M-14): it turns rows the chat and the quizzes already
 * store into the grid of `data/badges.json`, without writing anything.
 *
 * Two rules hold it together:
 * - Only counts and dates leave the rows. Answers are read with
 *   `withBodies = false`, and of the messages the person wrote only the
 *   timestamp is kept, so no text of anyone crosses into the profile payload.
 * - A failed read returns `null`, not zeros. Zero would unlock nothing and say
 *   "you have done none of this", which is a claim about a person; `null` means
 *   the section is simply not shown (`docs/INSIGNIAS.md` §5).
 */
import { BADGES } from "@/config/badges";
import { badgeProgress, unlockedBadgeIds, type BadgeConversationTally } from "@/domain/badges/badge-progress";
import { answeredRounds, completedRounds, isFree } from "@/domain/chat";
import type { Clock } from "@/domain/shared";

import type { ConversationRepository, ConversationRow, RoundRow, AnswerRow } from "./chat/conversation-ports";
import { factsOf, sideOf } from "./chat/conversation-view";
import { ROUND_POLICY } from "./chat/settings";
import type { QuizRepository } from "./quiz/ports";

export interface BadgeDeps {
  conversations: Pick<ConversationRepository, "listFor" | "roundsOf" | "answersOf" | "recentMessagesBy">;
  quizzes: Pick<QuizRepository, "getAttempts">;
  clock: Clock;
}

const MS_PER_DAY = 86_400_000;

/** First instant that still counts as a day inside the activity window. */
function windowStart(now: Date): Date {
  return new Date(now.getTime() - (BADGES.politica.ventana_actividad_dias - 1) * MS_PER_DAY);
}

function tallyOf(row: ConversationRow, rounds: readonly RoundRow[], answers: readonly AnswerRow[], now: Date): BadgeConversationTally {
  const facts = factsOf(row, rounds, answers);
  return {
    answeredRounds: answeredRounds(facts),
    completedRounds: completedRounds(facts, now, ROUND_POLICY),
    freeChat: isFree(facts, now, ROUND_POLICY),
  };
}

/** The stamp of the last thing this person did in a conversation, or `null` if it was someone else. */
function ownLastAction(row: ConversationRow, viewer: string): Date | null {
  return row.lastActor === viewer ? row.updatedAt : null;
}

function ownSeenDate(row: ConversationRow, viewer: string): Date | null {
  return sideOf(row, viewer) === "a" ? row.seenA : row.seenB;
}

/** `null` on any failed read; never a partial grid. */
export async function deriveBadges(
  viewerId: string,
  totalMatches: number,
  deps: BadgeDeps,
): Promise<string[] | null> {
  const now = deps.clock.now();
  const conversations = await deps.conversations.listFor(viewerId);
  if (!conversations.ok) return null;
  const rows = conversations.value;
  const ids = rows.map((row) => row.id);
  const [rounds, answers, sent] = await Promise.all([
    deps.conversations.roundsOf(ids),
    deps.conversations.answersOf(ids, false),
    deps.conversations.recentMessagesBy(viewerId, windowStart(now), BADGES.politica.tope_mensajes_ventana),
  ]);
  if (!rounds.ok || !answers.ok || !sent.ok) return null;
  const attempts = await quizAttempts(viewerId, deps.quizzes);
  if (attempts === null) return null;

  const activity = [
    ...attempts.map((attempt) => attempt.completado_en),
    ...rounds.value.filter((round) => round.asker === viewerId).map((round) => round.createdAt),
    ...sent.value.map((message) => message.at),
    ...rows.map((row) => ownSeenDate(row, viewerId)),
    ...rows.map((row) => ownLastAction(row, viewerId)),
  ].filter((at): at is Date => at !== null);

  return unlockedBadgeIds(
    badgeProgress({
      totalMatches,
      quizzesCompleted: attempts.length,
      conversations: rows.map((row) => tallyOf(row, rounds.value, answers.value, now)),
      activity,
      now,
    }),
  );
}

/** The quiz adapter throws on an outage; an outage is not a zero. */
type QuizAttempt = Awaited<ReturnType<QuizRepository["getAttempts"]>>[number];

async function quizAttempts(viewerId: string, repo: BadgeDeps["quizzes"]): Promise<QuizAttempt[] | null> {
  try {
    return await repo.getAttempts(viewerId);
  } catch {
    return null;
  }
}
