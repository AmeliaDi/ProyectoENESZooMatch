/** Write half of the in-memory chat repository (see memory-conversations.ts). */
import { ok } from "@/domain/shared";

import type { ConversationRepository } from "../chat/conversation-ports";
import type { ConversationStore } from "./memory-conversation-store";

type Writes = Pick<
  ConversationRepository,
  "openRound" | "saveAnswer" | "react" | "feedback" | "setFreeReady" | "addMessage" | "markSeen" | "setPaused" | "setMuted"
  | "deleteMine" | "leave" | "block" | "report" | "purge" | "notify"
>;

function roundWrites(store: ConversationStore): Pick<Writes, "openRound" | "saveAnswer" | "react" | "feedback"> {
  return {
    async openRound(id, index, asker, question, at) {
      if (store.rounds.some((r) => r.conversationId === id && r.index === index)) return ok(false);
      store.rounds.push({
        conversationId: id, index, asker, createdAt: at, feedbackA: false, feedbackB: false,
        promptId: "promptId" in question ? question.promptId : null,
        customText: "customText" in question ? question.customText : null,
      });
      store.touch(id, asker, at);
      return ok(true);
    },
    async saveAnswer(id, author, round, answer, at) {
      if (store.answers.some((x) => x.conversationId === id && x.author === author && x.round === round)) return ok(false);
      const passed = "passed" in answer;
      store.answers.push({ conversationId: id, author, round, body: passed ? "" : answer.body, passed });
      store.touch(id, author, at);
      return ok(true);
    },
    async react(id, round, author, emoji) {
      store.reactions = store.reactions.filter((r) => !(r.conversationId === id && r.round === round && r.author === author));
      if (emoji !== null) store.reactions.push({ conversationId: id, round, author, emoji });
      return ok(undefined);
    },
    async feedback(id, author, round, liked) {
      const row = store.conversations.get(id);
      const target = store.rounds.find((r) => r.conversationId === id && r.index === round);
      if (!row || !target) return ok(false);
      const key = row.userA === author ? "feedbackA" : "feedbackB";
      if (target[key]) return ok(false);
      target[key] = true;
      if (liked) store.feedback.liked += 1;
      else store.feedback.notLiked += 1;
      return ok(true);
    },
  };
}

function stateWrites(store: ConversationStore): Pick<Writes, "setFreeReady" | "addMessage" | "markSeen" | "setPaused" | "setMuted" | "deleteMine"> {
  return {
    async setFreeReady(id, side, ready, actor, at) {
      return ok(store.update(id, { ...(side === "a" ? { freeReadyA: ready } : { freeReadyB: ready }), lastActor: actor, updatedAt: at }));
    },
    async addMessage(id, author, body, clientKey, at) {
      if (store.messages.some((m) => m.conversationId === id && m.author === author && m.clientKey === clientKey)) return ok(true);
      store.messages.push({ conversationId: id, id: store.nextId(), author, body, at, clientKey });
      store.touch(id, author, at);
      return ok(true);
    },
    async markSeen(id, side, at) {
      store.update(id, side === "a" ? { seenA: at } : { seenB: at });
      return ok(undefined);
    },
    setPaused: async (id, by, at) => ok(store.update(id, { pausedBy: by, updatedAt: at })),
    async setMuted(id, side, muted) {
      store.update(id, side === "a" ? { mutedA: muted } : { mutedB: muted });
      return ok(undefined);
    },
    async deleteMine(id, userId) {
      store.messages = store.messages.filter((m) => !(m.conversationId === id && m.author === userId));
      store.answers = store.answers.map((x) => (x.conversationId === id && x.author === userId ? { ...x, body: "", passed: true } : x));
      return ok(undefined);
    },
  };
}

function exitWrites(store: ConversationStore): Pick<Writes, "leave" | "block" | "report" | "purge" | "notify"> {
  const blockPair = (id: string, userId: string) => {
    const row = store.conversations.get(id);
    if (!row) return false;
    const other = row.userA === userId ? row.userB : row.userA;
    store.blocks.add(`${userId}:${other}`);
    for (const c of [...store.conversations.values()]) if (c.userA === row.userA && c.userB === row.userB) store.remove(c.id);
    store.removeSignals(userId, other);
    return true;
  };
  return {
    async leave(id) {
      const row = store.conversations.get(id);
      if (!row) return ok(undefined);
      store.remove(id);
      store.removeSignals(row.userA, row.userB, row.track);
      store.closures.set(`${row.track}:${row.userA}:${row.userB}`, store.now());
      return ok(undefined);
    },
    block: async (id, userId) => ok(blockPair(id, userId)),
    async report(id, userId, reason) {
      const row = store.conversations.get(id);
      if (!row) return ok(false);
      const recent = store.messages.filter((m) => m.conversationId === id).slice(-store.snapshotSize);
      store.reports.push({
        reporter: userId,
        reported: row.userA === userId ? row.userB : row.userA,
        reason,
        snapshot: recent.map((m) => ({ who: m.author === userId ? "reporta" : "reportada", body: m.body })),
      });
      return ok(blockPair(id, userId));
    },
    async purge() {},
    async notify(userId) {
      store.notified.push(userId);
    },
  };
}

export function memoryWrites(store: ConversationStore): Writes {
  return { ...roundWrites(store), ...stateWrites(store), ...exitWrites(store) };
}
