/**
 * Pure rules of a conversation between matches (docs/CHAT.md §10–11):
 * guided rounds with sealed answers → free chat once both accept after a
 * minimum of rounds. Everything is derived from stored facts plus the clock,
 * never stored, so it cannot drift.
 */

export type ConversationSide = "a" | "b";
export type ConversationStage = "rounds" | "free" | "paused";
/** What one side did with a round: nothing yet, an answer, or "Pasar". */
export type AnswerMark = "answer" | "pass" | null;

export interface RoundFacts {
  index: number;
  asker: ConversationSide;
  createdAt: Date;
  answered: Readonly<Record<ConversationSide, AnswerMark>>;
}

export interface ConversationFacts {
  /** Rounds in index order (0, 1, 2…). */
  rounds: readonly RoundFacts[];
  freeReady: Readonly<Record<ConversationSide, boolean>>;
  pausedBy: ConversationSide | null;
  /** Who asks the first question (stable per conversation). */
  firstAsker: ConversationSide;
}

export interface RoundPolicy {
  minForFree: number;
  revealHours: number;
  maxRounds: number;
}

const MS_PER_HOUR = 3_600_000;
const DEFAULT_ROUND_POLICY: RoundPolicy = {
  minForFree: 3,
  revealHours: 48,
  maxRounds: 3,
};

export function otherSide(side: ConversationSide): ConversationSide {
  return side === "a" ? "b" : "a";
}

/** Both sides left a mark (answer or "Pasar"): the round was done by people, not by the clock. */
export function isRoundAnswered(round: RoundFacts): boolean {
  return round.answered.a !== null && round.answered.b !== null;
}

/** Revealed when both answered (or passed), or once the wait is over. */
export function isRoundRevealed(round: RoundFacts, now: Date, policy: Pick<RoundPolicy, "revealHours">): boolean {
  if (isRoundAnswered(round)) return true;
  return now.getTime() - round.createdAt.getTime() >= policy.revealHours * MS_PER_HOUR;
}

/** The last round while it is still sealed; `null` when there is none open. */
export function openRound(facts: ConversationFacts, now: Date, policy: RoundPolicy): RoundFacts | null {
  const last = facts.rounds.at(-1);
  return last && !isRoundRevealed(last, now, policy) ? last : null;
}

export function completedRounds(facts: ConversationFacts, now: Date = new Date(), policy: RoundPolicy = DEFAULT_ROUND_POLICY): number {
  return facts.rounds.filter((round) => isRoundRevealed(round, now, policy)).length;
}

/** Rounds both participants actually did — a timeout reveal does not count here. */
export function answeredRounds(facts: ConversationFacts): number {
  return facts.rounds.filter(isRoundAnswered).length;
}

/** Turns alternate: whoever did not ask the last question asks the next one. */
export function nextAsker(facts: ConversationFacts): ConversationSide {
  const last = facts.rounds.at(-1);
  return last ? otherSide(last.asker) : facts.firstAsker;
}

export function isFree(facts: ConversationFacts, now: Date = new Date(), policy: RoundPolicy = DEFAULT_ROUND_POLICY): boolean {
  return (facts.freeReady.a && facts.freeReady.b) || completedRounds(facts, now, policy) >= policy.minForFree;
}

export function stageOf(facts: ConversationFacts, now: Date = new Date(), policy: RoundPolicy = DEFAULT_ROUND_POLICY): ConversationStage {
  if (facts.pausedBy !== null) return "paused";
  return isFree(facts, now, policy) ? "free" : "rounds";
}

export function canOpenRound(facts: ConversationFacts, side: ConversationSide, now: Date, policy: RoundPolicy): boolean {
  return (
    facts.pausedBy === null &&
    !isFree(facts, now, policy) &&
    openRound(facts, now, policy) === null &&
    nextAsker(facts) === side &&
    facts.rounds.length < policy.maxRounds
  );
}

/** Only the open round, once per side: nobody edits an answer or answers late. */
export function canAnswer(facts: ConversationFacts, side: ConversationSide, index: number, now: Date, policy: RoundPolicy): boolean {
  const round = openRound(facts, now, policy);
  return facts.pausedBy === null && round !== null && round.index === index && round.answered[side] === null;
}

/** Reactions go to the other side's answer of a revealed round. */
export function canReact(facts: ConversationFacts, side: ConversationSide, index: number, now: Date, policy: RoundPolicy): boolean {
  const round = facts.rounds.find((r) => r.index === index);
  return round !== undefined && isRoundRevealed(round, now, policy) && round.answered[otherSide(side)] === "answer";
}

/** The invitation to free chat appears after the minimum of completed rounds. */
export function canAcceptFree(facts: ConversationFacts, side: ConversationSide, now: Date, policy: RoundPolicy): boolean {
  return facts.pausedBy === null && !facts.freeReady[side] && completedRounds(facts, now, policy) >= policy.minForFree;
}

export function canSendMessage(facts: ConversationFacts, now: Date = new Date(), policy: RoundPolicy = DEFAULT_ROUND_POLICY): boolean {
  return stageOf(facts, now, policy) === "free";
}

/** Only who paused can resume; pausing again is a no-op conflict. */
export function canTogglePause(facts: ConversationFacts, side: ConversationSide, pause: boolean): boolean {
  return pause ? facts.pausedBy === null : facts.pausedBy === side;
}

/** Whether `side` can act now (answer or ask during guided rounds). */
export function isMyTurn(facts: ConversationFacts, side: ConversationSide, now: Date, policy: RoundPolicy): boolean {
  if (facts.pausedBy !== null) return false;
  const round = openRound(facts, now, policy);
  if (round) return round.answered[side] === null;
  if (isFree(facts, now, policy)) return false;
  return canOpenRound(facts, side, now, policy);
}
