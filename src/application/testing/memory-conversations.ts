/**
 * In-memory `ConversationRepository` modelling the SQL contract: a signal
 * opens a conversation only for a current match, answers are unique per
 * round, and leaving removes the conversation, its rows and both signals.
 */
import { ok } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import type { AnswerRow, ChatPeer, ConversationRepository, ConversationRow, MessageRow } from "../chat/conversation-ports";

export class ConversationStore {
  /** Current matches as `${track}:${a}:${b}` with a < b. */
  readonly matches = new Set<string>();
  readonly interests = new Set<string>();
  readonly conversations = new Map<string, ConversationRow>();
  readonly answers: AnswerRow[] = [];
  readonly messages: Array<MessageRow & { conversationId: string }> = [];
  readonly peers = new Map<string, ChatPeer>();
  readonly notified: string[] = [];
  private seq = 0;

  nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }

  addMatch(track: MatchTrack, x: string, y: string): void {
    const [a, b] = [x, y].sort();
    this.matches.add(`${track}:${a}:${b}`);
  }
}

const ordered = (x: string, y: string) => [x, y].sort() as [string, string];
const interestKey = (from: string, to: string, track: MatchTrack) => `${track}:${from}:${to}`;

function findPair(store: ConversationStore, a: string, b: string, track: MatchTrack) {
  return [...store.conversations.values()].find((c) => c.userA === a && c.userB === b && c.track === track);
}

function openConversation(store: ConversationStore, from: string, to: string, track: MatchTrack): ConversationRow {
  const [a, b] = ordered(from, to);
  const row: ConversationRow = {
    id: store.nextId(), track, userA: a, userB: b, freeReadyA: false, freeReadyB: false,
    seenA: null, seenB: null, lastActor: null, updatedAt: new Date(0),
  };
  store.conversations.set(row.id, row);
  return row;
}

function touch(store: ConversationStore, id: string, actor: string, at: Date) {
  const row = store.conversations.get(id);
  if (row) store.conversations.set(id, { ...row, lastActor: actor, updatedAt: at });
}

function interestPart(store: ConversationStore): Pick<ConversationRepository, "interestsFrom" | "expressInterest" | "withdrawInterest"> {
  return {
    interestsFrom: async (userId) =>
      ok([...store.interests].map((k) => k.split(":")).filter(([, from]) => from === userId)
        .map(([track, , to]) => ({ to: to!, track: track as MatchTrack }))),
    async expressInterest(from, to, track) {
      const [a, b] = ordered(from, to);
      if (from === to || !store.matches.has(`${track}:${a}:${b}`)) return ok({ kind: "gone" });
      const existing = findPair(store, a, b, track);
      if (existing) return ok({ kind: "open", conversationId: existing.id });
      store.interests.add(interestKey(from, to, track));
      if (!store.interests.has(interestKey(to, from, track))) return ok({ kind: "sent" });
      return ok({ kind: "open", conversationId: openConversation(store, from, to, track).id });
    },
    async withdrawInterest(from, to, track) {
      store.interests.delete(interestKey(from, to, track));
      return ok(undefined);
    },
  };
}

function readPart(store: ConversationStore): Pick<ConversationRepository, "listFor" | "answersOf" | "findFor" | "messages" | "peers"> {
  return {
    listFor: async (userId) => ok([...store.conversations.values()].filter((c) => c.userA === userId || c.userB === userId)),
    answersOf: async (ids, withBodies) =>
      ok(store.answers.filter((x) => ids.includes(x.conversationId)).map((x) => (withBodies ? x : { ...x, body: "" }))),
    async findFor(id, userId) {
      const row = store.conversations.get(id);
      return ok(row && (row.userA === userId || row.userB === userId) ? row : null);
    },
    messages: async (id, limit) => ok(store.messages.filter((m) => m.conversationId === id).slice(-limit)),
    peers: async (ids) => ok(ids.flatMap((id) => store.peers.get(id) ?? [])),
  };
}

function writePart(store: ConversationStore): Pick<ConversationRepository, "saveAnswer" | "acceptFree" | "addMessage" | "markSeen" | "leave" | "notify"> {
  return {
    async saveAnswer(id, author, round, body, at) {
      if (store.answers.some((x) => x.conversationId === id && x.author === author && x.round === round)) return ok(false);
      store.answers.push({ conversationId: id, author, round, body });
      touch(store, id, author, at);
      return ok(true);
    },
    async acceptFree(id, side, actor, at) {
      const row = store.conversations.get(id);
      if (!row || (side === "a" ? row.freeReadyA : row.freeReadyB)) return ok(false);
      store.conversations.set(id, { ...row, ...(side === "a" ? { freeReadyA: true } : { freeReadyB: true }), lastActor: actor, updatedAt: at });
      return ok(true);
    },
    async addMessage(id, author, body, at) {
      store.messages.push({ conversationId: id, id: store.nextId(), author, body, at });
      touch(store, id, author, at);
      return ok(true);
    },
    async markSeen(id, side, at) {
      const row = store.conversations.get(id);
      if (row) store.conversations.set(id, { ...row, ...(side === "a" ? { seenA: at } : { seenB: at }) });
      return ok(undefined);
    },
    async leave(id) {
      const row = store.conversations.get(id);
      if (!row) return ok(undefined);
      store.conversations.delete(id);
      store.answers.splice(0, store.answers.length, ...store.answers.filter((x) => x.conversationId !== id));
      store.messages.splice(0, store.messages.length, ...store.messages.filter((m) => m.conversationId !== id));
      store.interests.delete(interestKey(row.userA, row.userB, row.track));
      store.interests.delete(interestKey(row.userB, row.userA, row.track));
      return ok(undefined);
    },
    async notify(userId) {
      store.notified.push(userId);
    },
  };
}

export function memoryConversations(store: ConversationStore): ConversationRepository {
  return { ...interestPart(store), ...readPart(store), ...writePart(store) };
}
