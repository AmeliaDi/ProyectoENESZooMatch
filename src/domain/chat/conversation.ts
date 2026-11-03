/**
 * Pure rules of a conversation between matches (docs/CHAT.md §10):
 * question rounds → invitation to free chat → free chat. The stage is always
 * derived from stored facts, never stored, so it cannot drift.
 */

export type ConversationStage = "rounds" | "invite" | "free";
export type ConversationSide = "a" | "b";

export interface ConversationFacts {
  totalRounds: number;
  /** Round indices (0-based) each side has answered. */
  answered: Readonly<Record<ConversationSide, ReadonlySet<number>>>;
  freeReady: Readonly<Record<ConversationSide, boolean>>;
}

export function otherSide(side: ConversationSide): ConversationSide {
  return side === "a" ? "b" : "a";
}

/** First round not yet answered by BOTH sides; `null` once every round is done. */
export function currentRound(facts: ConversationFacts): number | null {
  for (let round = 0; round < facts.totalRounds; round += 1) {
    if (!facts.answered.a.has(round) || !facts.answered.b.has(round)) return round;
  }
  return null;
}

export function stageOf(facts: ConversationFacts): ConversationStage {
  if (currentRound(facts) !== null) return "rounds";
  return facts.freeReady.a && facts.freeReady.b ? "free" : "invite";
}

/** Only the current round, once per side: nobody runs ahead or edits an answer. */
export function canAnswer(facts: ConversationFacts, side: ConversationSide, round: number): boolean {
  return currentRound(facts) === round && !facts.answered[side].has(round);
}

export function canAcceptFree(facts: ConversationFacts, side: ConversationSide): boolean {
  return stageOf(facts) === "invite" && !facts.freeReady[side];
}

/** Whether `side` can act now: answer the current round or accept the invitation. */
export function isMyTurn(facts: ConversationFacts, side: ConversationSide): boolean {
  const round = currentRound(facts);
  if (round !== null) return !facts.answered[side].has(round);
  return stageOf(facts) === "invite" && !facts.freeReady[side];
}

/** A round's other answer is revealed only when both answered it. */
export function isRoundRevealed(facts: ConversationFacts, round: number): boolean {
  return facts.answered.a.has(round) && facts.answered.b.has(round);
}

/** Rounds shown to a participant: done ones plus the current one; later questions stay hidden. */
export function visibleRoundCount(facts: ConversationFacts): number {
  const round = currentRound(facts);
  return round === null ? facts.totalRounds : round + 1;
}

const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const EXTRA_BLANK_LINES = /\n{3,}/g;
const TRAILING_SPACES = /[ \t]+\n/g;

/**
 * Normalises user text: NFC, no control or bidi-override characters, at most
 * one blank line in a row, trimmed. `null` when empty or longer than
 * `maxChars` code points (never truncated silently).
 */
export function cleanChatText(raw: string, maxChars: number): string | null {
  const text = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(TRAILING_SPACES, "\n")
    .replace(EXTRA_BLANK_LINES, "\n\n")
    .trim();
  const length = [...text].length;
  return length === 0 || length > maxChars ? null : text;
}
