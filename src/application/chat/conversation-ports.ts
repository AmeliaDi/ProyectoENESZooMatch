/**
 * Ports of the chat between matches (docs/CHAT.md §10). Adapters never
 * throw; every row they return belongs to a conversation the caller already
 * proved to be part of, or is filtered by participant in the query itself.
 */
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";
import type { Result } from "@/domain/shared";
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
  /** Last participant who wrote, answered or accepted; `null` right after opening. */
  lastActor: string | null;
  updatedAt: Date;
}

export interface AnswerRow {
  conversationId: string;
  author: string;
  round: number;
  body: string;
}

export interface MessageRow {
  id: string;
  author: string;
  body: string;
  at: Date;
}

export interface ChatPeer {
  userId: string;
  alias: string | null;
  animalId: string | null;
  colorId: string | null;
  mark: SubtypeMark | null;
  showAvatarDetail: boolean;
}

export interface InterestRow {
  to: string;
  track: MatchTrack;
}

/** `gone`: the pair is no longer a match on that track. */
export type InterestOutcome = { kind: "sent" } | { kind: "open"; conversationId: string } | { kind: "gone" };

/** `false` = conflict (already answered / lost a race), not a storage failure. */
export type WriteOutcome = Result<boolean, StorageError>;

export interface ConversationRepository {
  interestsFrom(userId: string): Promise<Result<InterestRow[], StorageError>>;
  /** Atomic: records the signal and opens the conversation when it is mutual. */
  expressInterest(from: string, to: string, track: MatchTrack): Promise<Result<InterestOutcome, StorageError>>;
  withdrawInterest(from: string, to: string, track: MatchTrack): Promise<Result<void, StorageError>>;
  listFor(userId: string): Promise<Result<ConversationRow[], StorageError>>;
  /** Answers of the given conversations; bodies are only read for one conversation. */
  answersOf(conversationIds: readonly string[], withBodies: boolean): Promise<Result<AnswerRow[], StorageError>>;
  /** The conversation only if `userId` takes part in it; `null` otherwise. */
  findFor(id: string, userId: string): Promise<Result<ConversationRow | null, StorageError>>;
  /** Newest `limit` messages, returned oldest first. */
  messages(id: string, limit: number): Promise<Result<MessageRow[], StorageError>>;
  saveAnswer(id: string, author: string, round: number, body: string, at: Date): Promise<WriteOutcome>;
  acceptFree(id: string, side: "a" | "b", actor: string, at: Date): Promise<WriteOutcome>;
  addMessage(id: string, author: string, body: string, at: Date): Promise<WriteOutcome>;
  markSeen(id: string, side: "a" | "b", at: Date): Promise<Result<void, StorageError>>;
  /**
   * Deletes the conversation (answers and messages cascade) and both signals:
   * reopening needs two new signals, so leaving cannot be undone one-sidedly.
   */
  leave(id: string, userId: string, otherId: string, track: MatchTrack): Promise<Result<void, StorageError>>;
  peers(userIds: readonly string[]): Promise<Result<ChatPeer[], StorageError>>;
  /** Content-free "tienes novedades" notice; at most one unread per person. */
  notify(userId: string): Promise<void>;
}
