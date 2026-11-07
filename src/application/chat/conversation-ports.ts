/**
 * Ports of the chat between matches (docs/CHAT.md §10–13). Adapters never
 * throw; every row they return belongs to a conversation the caller already
 * proved to be part of, or is filtered by participant in the query itself.
 */
import type { ReportReason } from "@/contracts/chat";
import type { IdentityDto } from "@/contracts/identity";
import type { Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import type { StorageError } from "../errors";

export interface ConversationRow {
  id: string;
  track: MatchTrack;
  /** Ordered pair: `userA < userB`, like `matches`. */
  userA: string;
  userB: string;
  freeReadyA: boolean;
  freeReadyB: boolean;
  seenA: Date | null;
  seenB: Date | null;
  mutedA: boolean;
  mutedB: boolean;
  pausedBy: string | null;
  /** Last participant who asked, wrote, answered or accepted; `null` right after opening. */
  lastActor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundRow {
  conversationId: string;
  index: number;
  asker: string;
  promptId: string | null;
  customText: string | null;
  feedbackA: boolean;
  feedbackB: boolean;
  createdAt: Date;
}

export interface AnswerRow {
  conversationId: string;
  author: string;
  round: number;
  /** Empty when passed, or when bodies were not requested. */
  body: string;
  passed: boolean;
}

export interface ReactionRow {
  round: number;
  author: string;
  emoji: string;
}

export interface MessageRow {
  id: string;
  author: string;
  body: string;
  at: Date;
}

/**
 * The counterpart as the chat may show them: the stored identity the adapter
 * already projected, with that person's sharing choices applied. Carrying the
 * DTO instead of loose name fields is what keeps the suffix — and therefore
 * the client's `parseIdentity()` — intact; a name rebuilt here loses it.
 */
export interface ChatPeer {
  userId: string;
  identity: IdentityDto;
}

export interface InterestRow {
  from: string;
  to: string;
  track: MatchTrack;
  createdAt: Date;
  declined: boolean;
}

export type InterestOutcome =
  | { kind: "sent" }
  | { kind: "open"; conversationId: string }
  | { kind: "gone" }
  | { kind: "adult_required" }
  | { kind: "cooldown" }
  | { kind: "too_many" };

/** `false` = conflict (already answered / lost a race), not a storage failure. */
export type WriteOutcome = Result<boolean, StorageError>;
type Done = Result<void, StorageError>;

export interface SignalPorts {
  /** Live signals sent by or to the user (expired ones are filtered by the caller). */
  interestsOf(userId: string): Promise<Result<InterestRow[], StorageError>>;
  /** Atomic: checks match, block, age, cooldown, open-signal cap; opens when mutual. */
  expressInterest(from: string, to: string, track: MatchTrack): Promise<Result<InterestOutcome, StorageError>>;
  withdrawInterest(from: string, to: string, track: MatchTrack): Promise<Done>;
  /** "Ahora no": hides it for the receiver only; the sender is never told. */
  declineInterest(from: string, to: string, track: MatchTrack, at: Date): Promise<Done>;
  isAdult(userId: string): Promise<Result<boolean, StorageError>>;
  confirmAdult(userId: string, at: Date): Promise<Done>;
}

export interface ReadPorts {
  listFor(userId: string): Promise<Result<ConversationRow[], StorageError>>;
  /** The conversation only if `userId` takes part in it; `null` otherwise. */
  findFor(id: string, userId: string): Promise<Result<ConversationRow | null, StorageError>>;
  roundsOf(conversationIds: readonly string[]): Promise<Result<RoundRow[], StorageError>>;
  /** Bodies are only read for one conversation (`withBodies`). */
  answersOf(conversationIds: readonly string[], withBodies: boolean): Promise<Result<AnswerRow[], StorageError>>;
  reactionsOf(id: string): Promise<Result<ReactionRow[], StorageError>>;
  /** Newest `limit` messages before `before` (if given), returned oldest first. */
  messages(id: string, limit: number, before: Date | null): Promise<Result<MessageRow[], StorageError>>;
  /** Messages by `author` since `since` (rate limit), newest first, up to `limit`. */
  recentMessagesBy(author: string, since: Date, limit: number): Promise<Result<MessageRow[], StorageError>>;
  peers(userIds: readonly string[]): Promise<Result<ChatPeer[], StorageError>>;
  latents(userIds: readonly string[]): Promise<Result<Map<string, LatentProfile>, StorageError>>;
}

export interface WritePorts {
  openRound(id: string, index: number, asker: string, question: { promptId: string } | { customText: string }, at: Date): Promise<WriteOutcome>;
  saveAnswer(id: string, author: string, round: number, answer: { body: string } | { passed: true }, at: Date): Promise<WriteOutcome>;
  react(id: string, round: number, author: string, emoji: string | null, at: Date): Promise<Done>;
  feedback(id: string, author: string, round: number, liked: boolean): Promise<WriteOutcome>;
  setFreeReady(id: string, side: "a" | "b", ready: boolean, actor: string, at: Date): Promise<WriteOutcome>;
  /** Idempotent by `clientKey`: a retry returns `true` without a second row. */
  addMessage(id: string, author: string, body: string, clientKey: string, at: Date): Promise<WriteOutcome>;
  markSeen(id: string, side: "a" | "b", at: Date): Promise<Done>;
  setPaused(id: string, by: string | null, at: Date): Promise<WriteOutcome>;
  setMuted(id: string, side: "a" | "b", muted: boolean): Promise<Done>;
  /** Deletes the viewer's own messages and answers text (their side only). */
  deleteMine(id: string, userId: string): Promise<Done>;
  /** Deletes the conversation for both, both signals, and starts the cooldown. */
  leave(id: string, userId: string): Promise<Done>;
  /** Silent block: closes every conversation and signal of the pair. */
  block(id: string, userId: string): Promise<WriteOutcome>;
  /** Minimal snapshot for moderation, then a silent block. */
  report(id: string, userId: string, reason: ReportReason): Promise<WriteOutcome>;
  /** Retention purge (messages, idle conversations, expired signals, old closures). */
  purge(): Promise<void>;
  /** Content-free "tienes novedades" notice; at most one unread per person. */
  notify(userId: string): Promise<void>;
}

export type ConversationRepository = SignalPorts & ReadPorts & WritePorts;
