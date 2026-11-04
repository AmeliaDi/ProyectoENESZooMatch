/**
 * In-memory `ConversationRepository` modelling the SQL contract
 * (20261106000000_chat_safety.sql): signals open a conversation only for a
 * current match without a block, romance needs both adult flags, the
 * open-signal cap and the cooldown apply, rounds/answers are unique, message
 * delivery is idempotent, and leave/block/report remove everything.
 */
import { ok } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";

import type { ConversationRepository, InterestRow } from "../chat/conversation-ports";
import { ConversationStore, ordered } from "./memory-conversation-store";
import { memoryWrites } from "./memory-conversation-writes";

export { ConversationStore } from "./memory-conversation-store";

const MS_PER_DAY = 86_400_000;

function signalPart(store: ConversationStore): Pick<ConversationRepository, "interestsOf" | "expressInterest" | "withdrawInterest" | "declineInterest" | "isAdult" | "confirmAdult"> {
  return {
    interestsOf: async (userId) => ok(store.interests.filter((i) => i.from === userId || i.to === userId).map((i) => ({ ...i }))),
    async expressInterest(from, to, track) {
      const [a, b] = ordered(from, to);
      if (from === to || !store.matches.has(`${track}:${a}:${b}`) || store.isBlocked(from, to)) return ok({ kind: "gone" });
      const existing = store.findPair(a, b, track);
      if (existing) return ok({ kind: "open", conversationId: existing.id });
      if (track === "romance" && !store.adults.has(from)) return ok({ kind: "adult_required" });
      const closed = store.closures.get(`${track}:${a}:${b}`);
      if (closed && store.now().getTime() - closed.getTime() < store.cooldownDays * MS_PER_DAY) return ok({ kind: "cooldown" });
      store.dropExpired();
      const mine = store.interests.filter((i) => i.from === from);
      const already = mine.some((i) => i.to === to && i.track === track);
      if (!already && mine.length >= store.maxOpen) return ok({ kind: "too_many" });
      if (!already) store.interests.push({ from, to, track, createdAt: store.now(), declined: false });
      const back = store.interests.some((i) => i.from === to && i.to === from && i.track === track);
      if (!back || (track === "romance" && !store.adults.has(to))) return ok({ kind: "sent" });
      const row = store.open(a, b, track);
      store.removeSignals(from, to, track);
      return ok({ kind: "open", conversationId: row.id });
    },
    async withdrawInterest(from, to, track) {
      store.interests = store.interests.filter((i) => !(i.from === from && i.to === to && i.track === track));
      return ok(undefined);
    },
    async declineInterest(from, to, track) {
      store.interests = store.interests.map((i): InterestRow => (i.from === from && i.to === to && i.track === track ? { ...i, declined: true } : i));
      return ok(undefined);
    },
    isAdult: async (userId) => ok(store.adults.has(userId)),
    async confirmAdult(userId) {
      store.adults.add(userId);
      return ok(undefined);
    },
  };
}

function readPart(store: ConversationStore): Pick<ConversationRepository, "listFor" | "findFor" | "roundsOf" | "answersOf" | "reactionsOf" | "messages" | "recentMessagesBy" | "peers" | "latents"> {
  return {
    listFor: async (userId) => ok([...store.conversations.values()].filter((c) => c.userA === userId || c.userB === userId)),
    async findFor(id, userId) {
      const row = store.conversations.get(id);
      return ok(row && (row.userA === userId || row.userB === userId) ? row : null);
    },
    roundsOf: async (ids) => ok(store.rounds.filter((r) => ids.includes(r.conversationId))),
    answersOf: async (ids, withBodies) =>
      ok(store.answers.filter((x) => ids.includes(x.conversationId)).map((x) => (withBodies ? x : { ...x, body: "" }))),
    reactionsOf: async (id) => ok(store.reactions.filter((r) => r.conversationId === id)),
    async messages(id, limit, before) {
      const own = store.messages.filter((m) => m.conversationId === id && (before === null || m.at < before));
      return ok(own.slice(-limit));
    },
    recentMessagesBy: async (author, since, limit) =>
      ok(store.messages.filter((m) => m.author === author && m.at >= since).reverse().slice(0, limit)),
    peers: async (ids) => ok(ids.flatMap((id) => store.peers.get(id) ?? [])),
    latents: async (ids) => ok(new Map(ids.flatMap((id): Array<[string, LatentProfile]> => {
      const latent = store.latents.get(id);
      return latent ? [[id, latent]] : [];
    }))),
  };
}

export function memoryConversations(store: ConversationStore): ConversationRepository {
  return { ...signalPart(store), ...readPart(store), ...memoryWrites(store) };
}

