import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import { CHAT_NOTICE } from "@/domain/messages/chat-notice";
import type { StoredMatch } from "../ports";
import { ConversationStore, memoryConversations } from "../testing/memory-conversations";
import { matchHandle } from "../match-handle";
import {
  acceptFreeChat,
  answerRound,
  expressInterest,
  getConversation,
  getInbox,
  interestStates,
  leaveConversation,
  sendMessage,
  withdrawInterest,
  type ConversationDeps,
  type InterestDeps,
} from "./index";

const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
const BEA = "bbbbbbbb-0000-4000-8000-000000000002";
const EVE = "eeeeeeee-0000-4000-8000-000000000003";
const ROUNDS = CHAT_CONFIG.conversation.rounds.amistad.length;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

let store: ConversationStore;
let now: number;

function deps(): ConversationDeps {
  return { conversations: memoryConversations(store), clock: { now: () => new Date((now += 1000)) } };
}

function interestDeps(): InterestDeps {
  const listFor = async (viewer: string) => ({
    ok: true as const,
    value: [...store.matches].map((key) => key.split(":")).filter(([, a, b]) => a === viewer || b === viewer)
      .map(([track, a, b]): StoredMatch => ({
        track: track as StoredMatch["track"], otherUser: a === viewer ? b! : a!, otherAlias: null,
        otherAnimal: null, otherColor: null, similarity: 0.6, badges: [],
      })),
  });
  return { matches: { listFor }, conversations: memoryConversations(store), digest };
}

const handle = (viewer: string, other: string) => matchHandle(viewer, other, digest);

async function open(): Promise<string> {
  await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, interestDeps());
  const state = await expressInterest(BEA, { match: handle(BEA, ANA), track: "amistad" }, interestDeps());
  if (!state.ok || state.value.state !== "open") throw new Error("expected an open conversation");
  return state.value.conversation;
}

beforeEach(() => {
  store = new ConversationStore();
  store.addMatch("amistad", ANA, BEA);
  store.peers.set(BEA, { userId: BEA, alias: "Nutria Serena", animalId: "nutria", colorId: "ennea-2", mark: "sx", showAvatarDetail: false });
  store.peers.set(ANA, { userId: ANA, alias: "Zorro Calmo", animalId: "zorro", colorId: "ennea-5", mark: null, showAvatarDetail: true });
  now = Date.parse("2026-11-04T10:00:00Z");
});

describe("interest signals", () => {
  it("keeps a one-sided signal invisible to the other person", async () => {
    const sent = await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, interestDeps());
    expect(sent).toEqual({ ok: true, value: { state: "sent" } });
    const theirs = await interestStates(BEA, interestDeps());
    expect(theirs.ok && theirs.value.states).toEqual({});
    expect(store.notified).toEqual([]);
  });

  it("opens one conversation when mutual and notifies the first sender", async () => {
    const id = await open();
    expect(store.conversations.size).toBe(1);
    expect(store.notified).toEqual([ANA]);
    const mine = await interestStates(ANA, interestDeps());
    expect(mine.ok && mine.value.states[`amistad:${handle(ANA, BEA)}`]).toEqual({ state: "open", conversation: id });
  });

  it("refuses handles that are not a current match on that track", async () => {
    const other = await expressInterest(ANA, { match: handle(ANA, EVE), track: "amistad" }, interestDeps());
    expect(other).toEqual({ ok: false, error: "chat.match_gone" });
    const wrongTrack = await expressInterest(ANA, { match: handle(ANA, BEA), track: "romance" }, interestDeps());
    expect(wrongTrack).toEqual({ ok: false, error: "chat.match_gone" });
  });

  it("withdraws an unanswered signal", async () => {
    await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, interestDeps());
    await withdrawInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, interestDeps());
    const state = await expressInterest(BEA, { match: handle(BEA, ANA), track: "amistad" }, interestDeps());
    expect(state).toEqual({ ok: true, value: { state: "sent" } });
  });
});

describe("question rounds", () => {
  it("hides the other answer until both answered the round", async () => {
    const id = await open();
    const afterAna = await answerRound(id, ANA, { round: 0, body: "Caminar por las islas" }, deps());
    expect(afterAna.ok && afterAna.value.rounds[0]).toMatchObject({ mine: "Caminar por las islas", theirs: null });
    const beaView = await getConversation(id, BEA, deps());
    expect(beaView.ok && beaView.value.rounds[0]?.theirs).toBeNull();
    const afterBea = await answerRound(id, BEA, { round: 0, body: "Leer en el pasto" }, deps());
    expect(afterBea.ok && afterBea.value.rounds[0]?.theirs).toBe("Caminar por las islas");
    expect(afterBea.ok && afterBea.value.rounds).toHaveLength(2);
  });

  it("refuses answering ahead, twice or empty", async () => {
    const id = await open();
    expect(await answerRound(id, ANA, { round: 1, body: "adelantado" }, deps())).toEqual({ ok: false, error: "chat.conflict" });
    await answerRound(id, ANA, { round: 0, body: "una" }, deps());
    expect(await answerRound(id, ANA, { round: 0, body: "otra" }, deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(await answerRound(id, BEA, { round: 0, body: " \u202E " }, deps())).toEqual({ ok: false, error: "request.invalid" });
  });

  it("opens free chat only after every round and both acceptances", async () => {
    const id = await open();
    expect(await sendMessage(id, ANA, { body: "hola" }, deps())).toEqual({ ok: false, error: "chat.conflict" });
    for (let round = 0; round < ROUNDS; round += 1) {
      await answerRound(id, ANA, { round, body: `a${round}` }, deps());
      await answerRound(id, BEA, { round, body: `b${round}` }, deps());
    }
    const accepted = await acceptFreeChat(id, ANA, deps());
    expect(accepted.ok && accepted.value).toMatchObject({ stage: "invite", freeReady: { mine: true, theirs: false } });
    const before = await getConversation(id, BEA, deps());
    expect(before.ok && before.value.freeReady).toEqual({ mine: false, theirs: false });
    const both = await acceptFreeChat(id, BEA, deps());
    expect(both.ok && both.value.stage).toBe("free");
    const sent = await sendMessage(id, BEA, { body: "¡Hola!" }, deps());
    expect(sent.ok && sent.value.messages).toEqual([expect.objectContaining({ mine: true, body: "¡Hola!" })]);
  });
});

describe("privacy and access", () => {
  it("treats someone else's conversation exactly like a missing one", async () => {
    const id = await open();
    expect(await getConversation(id, EVE, deps())).toEqual({ ok: false, error: "chat.not_found" });
    expect(await answerRound(id, EVE, { round: 0, body: "x" }, deps())).toEqual({ ok: false, error: "chat.not_found" });
    expect(await leaveConversation(id, EVE, deps())).toEqual({ ok: false, error: "chat.not_found" });
    expect(store.conversations.size).toBe(1);
  });

  it("never serialises user ids and hides the wing without opt-in", async () => {
    const id = await open();
    const view = await getConversation(id, ANA, deps());
    const json = JSON.stringify(view);
    expect(json).not.toContain(ANA);
    expect(json).not.toContain(BEA);
    expect(view.ok && view.value.peer).toEqual({ alias: "Nutria Serena", animal_id: "nutria", color_id: "ennea-2", color_hex: expect.any(String), mark: null });
    const inbox = await getInbox(ANA, deps());
    expect(JSON.stringify(inbox)).not.toContain(BEA);
  });

  it("marks unread and turn in the inbox without content", async () => {
    const id = await open();
    await answerRound(id, ANA, { round: 0, body: "secreto" }, deps());
    const inbox = await getInbox(BEA, deps());
    expect(inbox.ok && inbox.value.conversations[0]).toMatchObject({ id, unread: true, myTurn: true, round: 1, totalRounds: ROUNDS });
    expect(JSON.stringify(inbox)).not.toContain("secreto");
  });

  it("leaving deletes everything for both and requires two new signals", async () => {
    const id = await open();
    await answerRound(id, ANA, { round: 0, body: "algo" }, deps());
    const notifiedBefore = store.notified.length;
    expect(await leaveConversation(id, BEA, deps())).toEqual({ ok: true, value: undefined });
    expect(store.conversations.size).toBe(0);
    expect(store.answers).toEqual([]);
    expect(store.notified.length).toBe(notifiedBefore);
    expect(await getConversation(id, ANA, deps())).toEqual({ ok: false, error: "chat.not_found" });
    const again = await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, interestDeps());
    expect(again).toEqual({ ok: true, value: { state: "sent" } });
  });

  it("keeps the notification free of content", () => {
    expect(`${CHAT_NOTICE.title} ${CHAT_NOTICE.body}`).not.toMatch(/Nutria|Zorro|alias/);
  });
});
