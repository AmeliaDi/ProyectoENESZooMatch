/**
 * Read side of a conversation (docs/CHAT.md §10–11): facts from rows, and the
 * DTO a participant may see. Sealed answers, the other side's free-chat
 * acceptance (before the viewer accepts) and user ids never leave here.
 */
import type { ConversationDto, RoundDto } from "@/contracts/chat";
import {
  canAcceptFree,
  canOpenRound,
  completedRounds,
  isRoundRevealed,
  stageOf,
  type AnswerMark,
  type ConversationFacts,
  type ConversationSide,
  type RoundFacts,
} from "@/domain/chat";
import { fnv1a32 } from "@/domain/shared";

import type { AnswerRow, ChatPeer, ConversationRow, MessageRow, ReactionRow, RoundRow } from "./conversation-ports";
import { toPeerDto } from "./peer-view";
import { promptText, type PromptCard } from "./prompts";
import { ROUND_POLICY, SETTINGS } from "./settings";

const MS_PER_HOUR = 3_600_000;

export const sideOf = (row: ConversationRow, viewer: string): ConversationSide => (row.userA === viewer ? "a" : "b");
export const otherOf = (row: ConversationRow, viewer: string) => (row.userA === viewer ? row.userB : row.userA);


/** Stable first asker per conversation, so neither side always starts. */
function firstAsker(row: ConversationRow): ConversationSide {
  return fnv1a32(row.id) % 2 === 0 ? "a" : "b";
}

function markOf(answers: readonly AnswerRow[], round: RoundRow, user: string): AnswerMark {
  const found = answers.find((x) => x.conversationId === round.conversationId && x.round === round.index && x.author === user);
  if (!found) return null;
  return found.passed ? "pass" : "answer";
}

export function factsOf(row: ConversationRow, rounds: readonly RoundRow[], answers: readonly AnswerRow[]): ConversationFacts {
  const own = rounds.filter((r) => r.conversationId === row.id).sort((x, y) => x.index - y.index);
  return {
    rounds: own.map((round): RoundFacts => ({
      index: round.index,
      asker: round.asker === row.userA ? "a" : "b",
      createdAt: round.createdAt,
      answered: { a: markOf(answers, round, row.userA), b: markOf(answers, round, row.userB) },
    })),
    freeReady: { a: row.freeReadyA, b: row.freeReadyB },
    pausedBy: row.pausedBy === null ? null : row.pausedBy === row.userA ? "a" : "b",
    firstAsker: firstAsker(row),
  };
}

export interface Loaded {
  row: ConversationRow;
  rounds: RoundRow[];
  answers: AnswerRow[];
  reactions: ReactionRow[];
  facts: ConversationFacts;
}

interface RoundContext {
  loaded: Loaded;
  viewer: string;
  now: Date;
}

function roundDto(round: RoundRow, ctx: RoundContext): RoundDto {
  const { loaded, viewer, now } = ctx;
  const other = otherOf(loaded.row, viewer);
  const facts = loaded.facts.rounds.find((r) => r.index === round.index);
  const revealed = facts ? isRoundRevealed(facts, now, ROUND_POLICY) : false;
  const answer = (user: string) => loaded.answers.find((x) => x.round === round.index && x.author === user);
  const mine = answer(viewer);
  const theirs = revealed ? answer(other) : undefined;
  const reaction = (author: string) => loaded.reactions.find((r) => r.round === round.index && r.author === author)?.emoji ?? null;
  const side = sideOf(loaded.row, viewer);
  return {
    index: round.index,
    question: round.customText ?? promptText(round.promptId),
    askedByMe: round.asker === viewer,
    mine: mine && !mine.passed ? mine.body : null,
    minePassed: mine?.passed === true,
    theirs: theirs && !theirs.passed ? theirs.body : null,
    theirsPassed: theirs?.passed === true,
    revealed,
    ...(revealed ? {} : { revealsAt: new Date(round.createdAt.getTime() + ROUND_POLICY.revealHours * MS_PER_HOUR).toISOString() }),
    myReaction: reaction(viewer),
    theirReaction: reaction(other),
    feedbackGiven: side === "a" ? round.feedbackA : round.feedbackB,
  };
}

export interface ViewExtras {
  peer: ChatPeer | undefined;
  messages: MessageRow[];
  hasOlder: boolean;
  suggestions: PromptCard[];
  refresh: number;
}

export function toDto(loaded: Loaded, viewer: string, now: Date, extras: ViewExtras): ConversationDto {
  const { row, facts } = loaded;
  const side = sideOf(row, viewer);
  const mine = side === "a" ? row.freeReadyA : row.freeReadyB;
  const theirs = side === "a" ? row.freeReadyB : row.freeReadyA;
  const stage = stageOf(facts, now, ROUND_POLICY);
  const asking = canOpenRound(facts, side, now, ROUND_POLICY);
  const ctx = { loaded, viewer, now };
  return {
    id: row.id,
    track: row.track,
    peer: toPeerDto(extras.peer),
    stage,
    pausedByMe: facts.pausedBy === side,
    muted: side === "a" ? row.mutedA : row.mutedB,
    rounds: loaded.rounds.map((round) => roundDto(round, ctx)),
    completedRounds: completedRounds(facts, now, ROUND_POLICY),
    minRoundsForFree: ROUND_POLICY.minForFree,
    ask: asking ? { suggestions: extras.suggestions, refresh: extras.refresh, canWriteOwn: stage === "free" } : null,
    free: { canAccept: canAcceptFree(facts, side, now, ROUND_POLICY), mine, theirs: mine && theirs },
    messages: extras.messages.map((m) => ({ id: m.id, mine: m.author === viewer, body: m.body, at: m.at.toISOString() })),
    hasOlder: extras.hasOlder,
    limits: {
      answerChars: SETTINGS.answerChars,
      messageChars: SETTINGS.messageChars,
      customQuestionChars: SETTINGS.customQuestionChars,
    },
    reactions: [...SETTINGS.reactions],
  };
}

