/**
 * Conversations between matches (docs/CHAT.md §10). Every use case runs only
 * behind an open chat lock (the route enforces it) and first proves the
 * viewer takes part in the conversation; otherwise it answers `chat.not_found`
 * (never "exists but not yours").
 */
import { CHAT_CONFIG } from "@/config";
import type { ConversationDto, InboxDto, InboxEntryDto } from "@/contracts/chat";
import {
  canAcceptFree,
  canAnswer,
  cleanChatText,
  currentRound,
  isMyTurn,
  isRoundRevealed,
  stageOf,
  visibleRoundCount,
  type ConversationFacts,
  type ConversationSide,
} from "@/domain/chat";
import { err, ok, type Clock, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import type { AnswerRow, ChatPeer, ConversationRepository, ConversationRow, MessageRow } from "./conversation-ports";
import { toPeerDto } from "./peer-view";

const SETTINGS = CHAT_CONFIG.conversation;

export interface ConversationDeps {
  conversations: ConversationRepository;
  clock: Clock;
}

const sideOf = (row: ConversationRow, viewer: string): ConversationSide => (row.userA === viewer ? "a" : "b");
const otherOf = (row: ConversationRow, viewer: string) => (row.userA === viewer ? row.userB : row.userA);
const questionsOf = (row: ConversationRow) => SETTINGS.rounds[row.track];

function factsOf(row: ConversationRow, answers: readonly AnswerRow[]): ConversationFacts {
  const own = (user: string) => new Set(answers.filter((x) => x.conversationId === row.id && x.author === user).map((x) => x.round));
  return {
    totalRounds: questionsOf(row).length,
    answered: { a: own(row.userA), b: own(row.userB) },
    freeReady: { a: row.freeReadyA, b: row.freeReadyB },
  };
}

function inboxEntry(row: ConversationRow, viewer: string, answers: readonly AnswerRow[], peers: Map<string, ChatPeer>): InboxEntryDto {
  const facts = factsOf(row, answers);
  const side = sideOf(row, viewer);
  const seen = side === "a" ? row.seenA : row.seenB;
  const round = currentRound(facts);
  const fromOther = row.lastActor !== null && row.lastActor !== viewer;
  return {
    id: row.id,
    track: row.track,
    peer: toPeerDto(peers.get(otherOf(row, viewer))),
    stage: stageOf(facts),
    ...(round === null ? {} : { round: round + 1 }),
    totalRounds: facts.totalRounds,
    unread: seen === null || (fromOther && row.updatedAt > seen),
    myTurn: isMyTurn(facts, side),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function peerMap(userIds: readonly string[], deps: ConversationDeps): Promise<Result<Map<string, ChatPeer>, AppError>> {
  if (userIds.length === 0) return ok(new Map());
  const peers = await deps.conversations.peers(userIds);
  return peers.ok ? ok(new Map(peers.value.map((p) => [p.userId, p]))) : peers;
}

export async function getInbox(viewer: string, deps: ConversationDeps): Promise<Result<InboxDto, AppError>> {
  const rows = await deps.conversations.listFor(viewer);
  if (!rows.ok) return rows;
  const answers = await deps.conversations.answersOf(rows.value.map((r) => r.id), false);
  if (!answers.ok) return answers;
  const peers = await peerMap(rows.value.map((r) => otherOf(r, viewer)), deps);
  if (!peers.ok) return peers;
  const conversations = rows.value
    .map((row) => inboxEntry(row, viewer, answers.value, peers.value))
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  return ok({ conversations });
}

interface Loaded {
  row: ConversationRow;
  answers: AnswerRow[];
  facts: ConversationFacts;
}

async function load(id: string, viewer: string, deps: ConversationDeps): Promise<Result<Loaded, AppError>> {
  const row = await deps.conversations.findFor(id, viewer);
  if (!row.ok) return row;
  if (!row.value) return err("chat.not_found");
  const answers = await deps.conversations.answersOf([id], true);
  if (!answers.ok) return answers;
  return ok({ row: row.value, answers: answers.value, facts: factsOf(row.value, answers.value) });
}

function roundsView(loaded: Loaded, viewer: string): ConversationDto["rounds"] {
  const questions = questionsOf(loaded.row);
  const other = otherOf(loaded.row, viewer);
  const bodyOf = (author: string, round: number) =>
    loaded.answers.find((x) => x.author === author && x.round === round)?.body ?? null;
  return questions.slice(0, visibleRoundCount(loaded.facts)).map((question, index) => ({
    index,
    question,
    mine: bodyOf(viewer, index),
    theirs: isRoundRevealed(loaded.facts, index) ? bodyOf(other, index) : null,
  }));
}

function toDto(loaded: Loaded, viewer: string, peer: ChatPeer | undefined, messages: MessageRow[]): ConversationDto {
  const side = sideOf(loaded.row, viewer);
  const mine = side === "a" ? loaded.row.freeReadyA : loaded.row.freeReadyB;
  const theirs = side === "a" ? loaded.row.freeReadyB : loaded.row.freeReadyA;
  return {
    id: loaded.row.id,
    track: loaded.row.track,
    peer: toPeerDto(peer),
    stage: stageOf(loaded.facts),
    rounds: roundsView(loaded, viewer),
    totalRounds: loaded.facts.totalRounds,
    currentRound: currentRound(loaded.facts),
    freeReady: { mine, theirs: mine && theirs },
    messages: messages.map((m) => ({ id: m.id, mine: m.author === viewer, body: m.body, at: m.at.toISOString() })),
    limits: { answerChars: SETTINGS.answerChars, messageChars: SETTINGS.messageChars },
  };
}

/** Full view of one conversation; marks it as seen by the viewer. */
export async function getConversation(id: string, viewer: string, deps: ConversationDeps): Promise<Result<ConversationDto, AppError>> {
  const loaded = await load(id, viewer, deps);
  if (!loaded.ok) return loaded;
  const { row, facts } = loaded.value;
  const free = stageOf(facts) === "free";
  const [messages, peers] = await Promise.all([
    free ? deps.conversations.messages(id, SETTINGS.messagesPage) : Promise.resolve(ok<MessageRow[]>([])),
    peerMap([otherOf(row, viewer)], deps),
  ]);
  if (!messages.ok) return messages;
  if (!peers.ok) return peers;
  await deps.conversations.markSeen(id, sideOf(row, viewer), deps.clock.now());
  return ok(toDto(loaded.value, viewer, peers.value.get(otherOf(row, viewer)), messages.value));
}

type Action = (loaded: Loaded, side: ConversationSide, now: Date) => Promise<Result<boolean, AppError>> | Result<boolean, AppError>;

/** Shared shape of every write: load, act, notify the other side, return the fresh view. */
async function act(id: string, viewer: string, deps: ConversationDeps, action: Action): Promise<Result<ConversationDto, AppError>> {
  const loaded = await load(id, viewer, deps);
  if (!loaded.ok) return loaded;
  const written = await action(loaded.value, sideOf(loaded.value.row, viewer), deps.clock.now());
  if (!written.ok) return written;
  if (!written.value) return err("chat.conflict");
  await deps.conversations.notify(otherOf(loaded.value.row, viewer));
  return getConversation(id, viewer, deps);
}

export function answerRound(id: string, viewer: string, input: { round: number; body: string }, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, side, now) => {
    if (!canAnswer(loaded.facts, side, input.round)) return err("chat.conflict");
    const body = cleanChatText(input.body, SETTINGS.answerChars);
    if (body === null) return err("request.invalid");
    return deps.conversations.saveAnswer(id, viewer, input.round, body, now);
  });
}

export function acceptFreeChat(id: string, viewer: string, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, side, now) =>
    canAcceptFree(loaded.facts, side) ? deps.conversations.acceptFree(id, side, viewer, now) : err("chat.conflict"),
  );
}

export function sendMessage(id: string, viewer: string, input: { body: string }, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, _side, now) => {
    if (stageOf(loaded.facts) !== "free") return err("chat.conflict");
    const body = cleanChatText(input.body, SETTINGS.messageChars);
    if (body === null) return err("request.invalid");
    return deps.conversations.addMessage(id, viewer, body, now);
  });
}

/** Leaving deletes the conversation for both, silently; the other person is not notified. */
export async function leaveConversation(id: string, viewer: string, deps: ConversationDeps): Promise<Result<void, AppError>> {
  const row = await deps.conversations.findFor(id, viewer);
  if (!row.ok) return row;
  if (!row.value) return err("chat.not_found");
  return deps.conversations.leave(id, viewer, otherOf(row.value, viewer), row.value.track);
}
