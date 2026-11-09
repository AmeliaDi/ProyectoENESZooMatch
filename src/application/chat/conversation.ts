/**
 * Read use cases of the chat between matches (docs/CHAT.md §10–11). Every
 * one runs behind an open chat lock (the route enforces it) and first proves
 * the viewer takes part; otherwise it answers `chat.not_found` (never
 * "exists but not yours").
 */
import type { ConversationDto, InboxDto, InboxEntryDto } from "@/contracts/chat";
import { completedRounds, isFree, isMyTurn, stageOf } from "@/domain/chat";
import { err, ok, type Clock, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import type { ChatPeer, ConversationRepository, ConversationRow, MessageRow, RoundRow } from "./conversation-ports";
import { factsOf, otherOf, sideOf, toDto, type Loaded } from "./conversation-view";
import { pendingInvitations, type InvitationDeps } from "./invitations";
import { toPeerDto } from "./peer-view";
import { cardsFor, layerWeights, type PromptCard } from "./prompts";
import { ROUND_POLICY, SETTINGS } from "./settings";

export interface ConversationDeps {
  conversations: ConversationRepository;
  clock: Clock;
}

function inboxEntry(row: ConversationRow, viewer: string, loaded: Omit<Loaded, "row" | "facts" | "reactions">, peers: Map<string, ChatPeer>, now: Date): InboxEntryDto {
  const facts = factsOf(row, loaded.rounds, loaded.answers);
  const side = sideOf(row, viewer);
  const seen = side === "a" ? row.seenA : row.seenB;
  const fromOther = row.lastActor !== null && row.lastActor !== viewer;
  return {
    id: row.id,
    track: row.track,
    peer: toPeerDto(peers.get(otherOf(row, viewer))),
    stage: stageOf(facts, now, ROUND_POLICY),
    completedRounds: completedRounds(facts, now, ROUND_POLICY),
    unread: seen === null || (fromOther && row.updatedAt > seen),
    myTurn: isMyTurn(facts, side, now, ROUND_POLICY),
    updatedAt: row.updatedAt.toISOString(),
  };
}


export async function peerMap(userIds: readonly string[], repo: ConversationRepository): Promise<Result<Map<string, ChatPeer>, AppError>> {
  if (userIds.length === 0) return ok(new Map());
  const peers = await repo.peers(userIds);
  return peers.ok ? ok(new Map(peers.value.map((p) => [p.userId, p]))) : peers;
}

export async function getInbox(viewer: string, deps: ConversationDeps & InvitationDeps): Promise<Result<InboxDto, AppError>> {
  const rows = await deps.conversations.listFor(viewer);
  if (!rows.ok) return rows;
  const ids = rows.value.map((r) => r.id);
  const [rounds, answers, invitations] = await Promise.all([
    deps.conversations.roundsOf(ids),
    deps.conversations.answersOf(ids, false),
    pendingInvitations(viewer, deps),
  ]);
  if (!rounds.ok) return rounds;
  if (!answers.ok) return answers;
  if (!invitations.ok) return invitations;
  const peers = await peerMap(rows.value.map((r) => otherOf(r, viewer)), deps.conversations);
  if (!peers.ok) return peers;
  const now = deps.clock.now();
  const conversations = rows.value
    .map((row) => inboxEntry(row, viewer, { rounds: rounds.value, answers: answers.value }, peers.value, now))
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  return ok({ conversations, invitations: invitations.value });
}

export async function load(id: string, viewer: string, deps: ConversationDeps): Promise<Result<Loaded, AppError>> {
  const row = await deps.conversations.findFor(id, viewer);
  if (!row.ok) return row;
  if (!row.value) return err("chat.not_found");
  const [rounds, answers, reactions] = await Promise.all([
    deps.conversations.roundsOf([id]),
    deps.conversations.answersOf([id], true),
    deps.conversations.reactionsOf(id),
  ]);
  if (!rounds.ok) return rounds;
  if (!answers.ok) return answers;
  if (!reactions.ok) return reactions;
  const sorted = [...rounds.value].sort((x, y) => x.index - y.index);
  return ok({ row: row.value, rounds: sorted, answers: answers.value, reactions: reactions.value, facts: factsOf(row.value, sorted, answers.value) });
}

const usedPrompts = (rounds: readonly RoundRow[]) => new Set(rounds.flatMap((r) => (r.promptId ? [r.promptId] : [])));

async function suggestionsFor(loaded: Loaded, viewer: string, refresh: number, deps: ConversationDeps): Promise<PromptCard[]> {
  const other = otherOf(loaded.row, viewer);
  const latents = await deps.conversations.latents([viewer, other]);
  const weights = latents.ok ? layerWeights(loaded.row.track, latents.value.get(viewer), latents.value.get(other)) : {};
  return cardsFor({
    conversationId: loaded.row.id,
    track: loaded.row.track,
    roundIndex: loaded.rounds.length,
    used: usedPrompts(loaded.rounds),
    weights,
    refresh,
  });
}

export interface ViewOptions {
  /** "Otras tres": page of the ranked cards (0 = first offer). */
  refresh?: number;
  /** ISO date: older free-chat messages before it. */
  before?: Date;
}

async function messagesFor(loaded: Loaded, now: Date, options: ViewOptions, deps: ConversationDeps): Promise<Result<{ list: MessageRow[]; hasOlder: boolean }, AppError>> {
  if (!isFree(loaded.facts, now, ROUND_POLICY)) return ok({ list: [], hasOlder: false });
  const page = await deps.conversations.messages(loaded.row.id, SETTINGS.messagesPage + 1, options.before ?? null);
  if (!page.ok) return page;
  const hasOlder = page.value.length > SETTINGS.messagesPage;
  return ok({ list: hasOlder ? page.value.slice(1) : page.value, hasOlder });
}

/** Full view of one conversation; marks it as seen by the viewer. */
export async function getConversation(id: string, viewer: string, deps: ConversationDeps, options: ViewOptions = {}): Promise<Result<ConversationDto, AppError>> {
  const loaded = await load(id, viewer, deps);
  if (!loaded.ok) return loaded;
  const { row } = loaded.value;
  const refresh = options.refresh ?? 0;
  const now = deps.clock.now();
  const [messages, peers, suggestions] = await Promise.all([
    messagesFor(loaded.value, now, options, deps),
    peerMap([viewer, otherOf(row, viewer)], deps.conversations),
    suggestionsFor(loaded.value, viewer, refresh, deps),
  ]);
  if (!messages.ok) return messages;
  if (!peers.ok) return peers;
  await deps.conversations.markSeen(id, sideOf(row, viewer), now);
  return ok(toDto(loaded.value, viewer, now, {
    peer: peers.value.get(otherOf(row, viewer)),
    me: peers.value.get(viewer),
    messages: messages.value.list,
    hasOlder: messages.value.hasOlder,
    suggestions,
    refresh,
  }));
}
