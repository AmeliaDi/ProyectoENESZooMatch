/** Shared fixtures of the chat use-case tests: two matched people and helpers. */
import { createHash } from "node:crypto";

import type { StoredMatch } from "../ports";
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";
import { matchHandle } from "../match-handle";
import { answerRound, askQuestion, expressInterest, getConversation, type ConversationDeps, type InterestDeps } from "../chat";
import type { ChatPeer } from "../chat/conversation-ports";
import { counterpartIdentity } from "../identity-dto";
import { ConversationStore, memoryConversations } from "./memory-conversations";

export const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
export const BEA = "bbbbbbbb-0000-4000-8000-000000000002";
export const EVE = "eeeeeeee-0000-4000-8000-000000000003";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export interface World {
  store: ConversationStore;
  deps(): ConversationDeps & InterestDeps;
  advance(ms: number): void;
}

export function world(): World {
  const store = new ConversationStore();
  let now = Date.parse("2026-11-04T10:00:00Z");
  store.now = () => new Date(now);
  const listFor = async (viewer: string) => ({
    ok: true as const,
    value: [...store.matches].map((key) => key.split(":")).filter(([, a, b]) => a === viewer || b === viewer)
      .map(([track, a, b]): StoredMatch => ({
        track: track as StoredMatch["track"], otherUser: a === viewer ? b! : a!,
        similarity: 0.6, badges: [],
      })),
  });
  store.addMatch("amistad", ANA, BEA);
  store.addMatch("romance", ANA, BEA);
  store.peers.set(BEA, frozenPeer(BEA, "nutria serena · KMPQ", "KMPQ", "nutria", "ennea-2", "sx", false));
  store.peers.set(ANA, frozenPeer(ANA, "zorro calmo · DRRS", "DRRS", "zorro", "ennea-5", null, true));
  return {
    store,
    deps: () => ({ conversations: memoryConversations(store), matches: { listFor }, digest, clock: { now: () => new Date((now += 1000)) } }),
    advance: (ms) => {
      now += ms;
    },
  };
}

export const handle = (viewer: string, other: string) => matchHandle(viewer, other, digest);

/** A frozen identity projected the way the Supabase adapter projects it, suffix included. */
function frozenPeer(
  userId: string,
  aliasCompleto: string,
  aliasSufijo: string,
  animalId: string,
  colorId: string,
  mark: SubtypeMark | null,
  showAvatarDetail: boolean,
): ChatPeer {
  return {
    userId,
    identity: counterpartIdentity({
      userId, estadoIdentidad: "eclosionado", aliasCompleto, aliasAnimal: null, aliasColor: null,
      aliasSufijo, mbtiCode: null, enneagramCode: null, latent: null, animalId, colorId, mark,
      showAvatarDetail, sharedLayers: [],
    }),
  };
}

/** Opens a conversation by mutual signal and returns its id. */
export async function open(w: World, track: "amistad" | "romance" = "amistad"): Promise<string> {
  await expressInterest(ANA, { match: handle(ANA, BEA), track }, w.deps());
  const state = await expressInterest(BEA, { match: handle(BEA, ANA), track }, w.deps());
  if (!state.ok || state.value.state !== "open") throw new Error(`expected an open conversation, got ${JSON.stringify(state)}`);
  return state.value.conversation;
}

/** Whoever may ask the next question. */
export async function askerOf(w: World, id: string): Promise<string> {
  const view = await getConversation(id, ANA, w.deps());
  return view.ok && view.value.ask ? ANA : BEA;
}

/** Plays `n` full rounds (ask the first card, both answer). */
export async function playRounds(w: World, id: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const view = await getConversation(id, ANA, w.deps());
    const start = view.ok ? view.value.rounds.length : 0;
    const asker = await askerOf(w, id);
    const mine = await getConversation(id, asker, w.deps());
    const card = mine.ok ? mine.value.ask?.suggestions[0] : undefined;
    if (!card) throw new Error("no card to ask");
    await askQuestion(id, asker, { promptId: card.id }, w.deps());
    await answerRound(id, ANA, { round: start, body: `a${start}` }, w.deps());
    await answerRound(id, BEA, { round: start, body: `b${start}` }, w.deps());
  }
}
