/**
 * Write use cases of a conversation (docs/CHAT.md §10–12). Shape of each:
 * load (proves membership) → pure rule → write → notify (content-free) →
 * fresh view. A refused rule is `chat.conflict`, never a hint of why.
 */
import type { ConversationDto, ReportReason } from "@/contracts/chat";
import {
  canAcceptFree,
  canAnswer,
  canOpenRound,
  canReact,
  canSendMessage,
  canTogglePause,
  foldText,
  isRoundRevealed,
  stageOf,
  type ConversationSide,
} from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import { getConversation, load, type ConversationDeps } from "./conversation";
import { otherOf, sideOf, type Loaded } from "./conversation-view";
import { isKnownPrompt } from "./prompts";
import { ROUND_POLICY, SETTINGS } from "./settings";
import { checkMessageRate, guardText } from "./text-policy";

type Action = (loaded: Loaded, side: ConversationSide, now: Date) => Promise<Result<boolean, AppError>> | Result<boolean, AppError>;

interface ActOptions {
  /** Whether the other person gets the content-free notice (not for muting, pausing…). */
  notify: boolean;
}

/** Shared shape of every write: load, act, maybe notify, return the fresh view. */
async function act(id: string, viewer: string, deps: ConversationDeps, action: Action, options: ActOptions = { notify: true }): Promise<Result<ConversationDto, AppError>> {
  const loaded = await load(id, viewer, deps);
  if (!loaded.ok) return loaded;
  const written = await action(loaded.value, sideOf(loaded.value.row, viewer), deps.clock.now());
  if (!written.ok) return written;
  if (!written.value) return err("chat.conflict");
  const other = otherOf(loaded.value.row, viewer);
  const otherMuted = loaded.value.row.userA === other ? loaded.value.row.mutedA : loaded.value.row.mutedB;
  if (options.notify && !otherMuted) await deps.conversations.notify(other);
  return getConversation(id, viewer, deps);
}

export type AskInput = { promptId: string } | { customText: string };

/** Opens the next round: a bank card, a coincidence card, or (in free chat) an own question. */
export function askQuestion(id: string, viewer: string, input: AskInput, deps: ConversationDeps) {
  return act(id, viewer, deps, async (loaded, side, now) => {
    if (!canOpenRound(loaded.facts, side, now, ROUND_POLICY)) return err("chat.conflict");
    const index = loaded.rounds.length;
    if ("promptId" in input) {
      if (!isKnownPrompt(input.promptId, loaded.row.track) || loaded.rounds.some((r) => r.promptId === input.promptId)) return err("request.invalid");
      return deps.conversations.openRound(id, index, viewer, { promptId: input.promptId }, now);
    }
    const text = guardText(input.customText, SETTINGS.customQuestionChars);
    if (!text.ok) return text;
    if (stageOf(loaded.facts, now, ROUND_POLICY) === "free") {
      return deps.conversations.openRound(id, index, viewer, { customText: text.value }, now);
    }
    // Guided rounds keep their rule: nobody types a question. The only text
    // accepted here is a coincidence card offered to this pair, and what gets
    // stored is our text, not whatever arrived.
    const folded = foldText(text.value);
    if (folded.length === 0 || loaded.rounds.some((r) => foldText(r.customText ?? "") === folded)) return err("request.invalid");
    const offered = deps.questions ? (await deps.questions.of(viewer, otherOf(loaded.row, viewer))).find((q) => foldText(q.text) === folded) : undefined;
    if (!offered) return err("chat.conflict");
    return deps.conversations.openRound(id, index, viewer, { customText: offered.text }, now);
  });
}

export type AnswerInput = { round: number; body: string } | { round: number; pass: true };

export function answerRound(id: string, viewer: string, input: AnswerInput, deps: ConversationDeps) {
  return act(id, viewer, deps, async (loaded, side, now) => {
    if (!canAnswer(loaded.facts, side, input.round, now, ROUND_POLICY)) return err("chat.conflict");
    if ("pass" in input) return deps.conversations.saveAnswer(id, viewer, input.round, { passed: true }, now);
    const body = guardText(input.body, SETTINGS.answerChars);
    if (!body.ok) return body;
    return deps.conversations.saveAnswer(id, viewer, input.round, { body: body.value }, now);
  });
}

/** Quick emoji reaction to the other side's revealed answer (`null` removes it). */
export function reactToAnswer(id: string, viewer: string, input: { round: number; emoji: string | null }, deps: ConversationDeps) {
  return act(id, viewer, deps, async (loaded, side, now) => {
    if (input.emoji !== null && !SETTINGS.reactions.includes(input.emoji)) return err("request.invalid");
    if (!canReact(loaded.facts, side, input.round, now, ROUND_POLICY)) return err("chat.conflict");
    const done = await deps.conversations.react(id, input.round, viewer, input.emoji, now);
    return done.ok ? ok(true) : done;
  });
}

/** "¿Te gustó la conversación?": aggregate-only, once per round, never shown to anyone. */
export function roundFeedback(id: string, viewer: string, input: { round: number; liked: boolean }, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, _side, now) => {
    const round = loaded.facts.rounds.find((r) => r.index === input.round);
    if (!round || !isRoundRevealed(round, now, ROUND_POLICY)) return err("chat.conflict");
    return deps.conversations.feedback(id, viewer, input.round, input.liked);
  }, { notify: false });
}

/** Proposing/accepting free chat (both must); `ready: false` takes it back. */
export function setFreeChat(id: string, viewer: string, ready: boolean, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, side, now) => {
    if (ready && !canAcceptFree(loaded.facts, side, now, ROUND_POLICY)) return err("chat.conflict");
    const mine = side === "a" ? loaded.row.freeReadyA : loaded.row.freeReadyB;
    if (!ready && !mine) return err("chat.conflict");
    return deps.conversations.setFreeReady(id, side, ready, viewer, now);
  }, { notify: ready });
}

export function sendMessage(id: string, viewer: string, input: { body: string; clientKey: string }, deps: ConversationDeps) {
  return act(id, viewer, deps, async (loaded, _side, now) => {
    const stage = stageOf(loaded.facts, now, ROUND_POLICY);
    if (stage === "rounds") return err("chat.not_allowed");
    if (!canSendMessage(loaded.facts, now, ROUND_POLICY)) return err("chat.conflict");
    const body = guardText(input.body, SETTINGS.messageChars);
    if (!body.ok) return body;
    const rate = await checkMessageRate(viewer, body.value, now, deps.conversations);
    if (!rate.ok) return rate;
    return deps.conversations.addMessage(id, viewer, body.value, input.clientKey, now);
  });
}

export function setPaused(id: string, viewer: string, pause: boolean, deps: ConversationDeps) {
  return act(id, viewer, deps, (loaded, side, now) =>
    canTogglePause(loaded.facts, side, pause) ? deps.conversations.setPaused(id, pause ? viewer : null, now) : err("chat.conflict"),
  { notify: false });
}

export function setMuted(id: string, viewer: string, muted: boolean, deps: ConversationDeps) {
  return act(id, viewer, deps, async (_loaded, side) => {
    const done = await deps.conversations.setMuted(id, side, muted);
    return done.ok ? ok(true) : done;
  }, { notify: false });
}

/** Removes the viewer's own messages and answer texts; the other side keeps theirs. */
export function deleteMyMessages(id: string, viewer: string, deps: ConversationDeps) {
  return act(id, viewer, deps, async () => {
    const done = await deps.conversations.deleteMine(id, viewer);
    return done.ok ? ok(true) : done;
  }, { notify: false });
}

type Exit = (repo: ConversationDeps["conversations"], id: string, viewer: string) => Promise<Result<unknown, AppError>>;

async function exit(id: string, viewer: string, deps: ConversationDeps, run: Exit): Promise<Result<void, AppError>> {
  const row = await deps.conversations.findFor(id, viewer);
  if (!row.ok) return row;
  if (!row.value) return err("chat.not_found");
  const done = await run(deps.conversations, id, viewer);
  return done.ok ? ok(undefined) : done;
}

/** Closing: deleted for both, silently; the pair cools down before signalling again. */
export const leaveConversation = (id: string, viewer: string, deps: ConversationDeps) =>
  exit(id, viewer, deps, (repo) => repo.leave(id, viewer));

/** Silent block: every conversation and signal of the pair disappears; no notice. */
export const blockInConversation = (id: string, viewer: string, deps: ConversationDeps) =>
  exit(id, viewer, deps, (repo) => repo.block(id, viewer));

/** Report: minimal snapshot for moderation, then a silent block. Never shown to the other person. */
export const reportConversation = (id: string, viewer: string, reason: ReportReason, deps: ConversationDeps) =>
  exit(id, viewer, deps, (repo) => repo.report(id, viewer, reason));

