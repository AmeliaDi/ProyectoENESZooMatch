import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import { CHAT_NOTICE } from "@/domain/messages/chat-notice";

import { ANA, BEA, EVE, askerOf, handle, open, playRounds, world, type World } from "../testing/chat-world";
import {
  answerRound,
  askQuestion,
  confirmAdult,
  declineInterest,
  expressInterest,
  getConversation,
  getInbox,
  interestStates,
  setFreeChat,
} from "./index";

const SETTINGS = CHAT_CONFIG.conversation;

let w: World;
beforeEach(() => {
  w = world();
});

async function askFirstCard(id: string): Promise<{ asker: string; other: string }> {
  const asker = await askerOf(w, id);
  const view = await getConversation(id, asker, w.deps());
  const card = view.ok ? view.value.ask?.suggestions[0]?.id : undefined;
  if (!card) throw new Error("no card");
  await askQuestion(id, asker, { promptId: card }, w.deps());
  return { asker, other: asker === ANA ? BEA : ANA };
}

describe("interest signals", () => {
  it("shows the receiver a kind invitation; 'ahora no' is silent for the sender", async () => {
    const sent = await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, w.deps());
    expect(sent).toEqual({ ok: true, value: { state: "sent" } });
    const theirs = await interestStates(BEA, w.deps());
    expect(theirs.ok && theirs.value.states).toEqual({ [`amistad:${handle(BEA, ANA)}`]: { state: "invited" } });
    const inbox = await getInbox(BEA, w.deps());
    expect(inbox.ok && inbox.value.invitations).toEqual([
      { match: handle(BEA, ANA), track: "amistad", peer: expect.objectContaining({ alias: "Zorro Calmo" }) },
    ]);
    await declineInterest(BEA, { match: handle(BEA, ANA), track: "amistad" }, w.deps());
    const after = await interestStates(BEA, w.deps());
    expect(after.ok && after.value.states).toEqual({});
    const mine = await interestStates(ANA, w.deps());
    expect(mine.ok && mine.value.states[`amistad:${handle(ANA, BEA)}`]).toEqual({ state: "sent" });
  });

  it("opens directly when both signal; an unanswered signal expires silently", async () => {
    await open(w);
    expect(w.store.conversations.size).toBe(1);
    const fresh = world();
    await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, fresh.deps());
    fresh.advance(SETTINGS.signals.expireDays * 86_400_000);
    const late = await interestStates(BEA, fresh.deps());
    expect(late.ok && late.value.states).toEqual({});
  });

  it("refuses handles that are not a current match", async () => {
    const other = await expressInterest(ANA, { match: handle(ANA, EVE), track: "amistad" }, w.deps());
    expect(other).toEqual({ ok: false, error: "chat.match_gone" });
  });

  it("keeps romance for people who confirmed 18+, without revealing the other's age", async () => {
    const refused = await expressInterest(ANA, { match: handle(ANA, BEA), track: "romance" }, w.deps());
    expect(refused).toEqual({ ok: false, error: "chat.adult_required" });
    await confirmAdult(ANA, w.deps());
    const sent = await expressInterest(ANA, { match: handle(ANA, BEA), track: "romance" }, w.deps());
    expect(sent).toEqual({ ok: true, value: { state: "sent" } });
    await confirmAdult(BEA, w.deps());
    const opened = await expressInterest(BEA, { match: handle(BEA, ANA), track: "romance" }, w.deps());
    expect(opened.ok && opened.value.state).toBe("open");
  });

  it("caps open signals per person", async () => {
    w.store.maxOpen = 1;
    w.store.addMatch("amistad", ANA, EVE);
    await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, w.deps());
    const second = await expressInterest(ANA, { match: handle(ANA, EVE), track: "amistad" }, w.deps());
    expect(second).toEqual({ ok: false, error: "chat.too_many_signals" });
  });
});

describe("guided rounds", () => {
  it("offers three cards only to whoever asks, and alternates turns", async () => {
    const id = await open(w);
    const asker = await askerOf(w, id);
    const waiting = await getConversation(id, asker === ANA ? BEA : ANA, w.deps());
    expect(waiting.ok && waiting.value.ask).toBeNull();
    const cards = await getConversation(id, asker, w.deps());
    expect(cards.ok && cards.value.ask?.suggestions).toHaveLength(SETTINGS.rounds.suggestions);
    await playRounds(w, id, 1);
    expect(await askerOf(w, id)).not.toBe(asker);
  });

  it("keeps answers sealed until both answered, and allows passing", async () => {
    const id = await open(w);
    const { asker, other } = await askFirstCard(id);
    await answerRound(id, asker, { round: 0, body: "secreto" }, w.deps());
    const sealed = await getConversation(id, other, w.deps());
    expect(sealed.ok && sealed.value.rounds[0]).toMatchObject({ theirs: null, revealed: false });
    expect(JSON.stringify(sealed)).not.toContain("secreto");
    const passed = await answerRound(id, other, { round: 0, pass: true }, w.deps());
    expect(passed.ok && passed.value.rounds[0]).toMatchObject({ theirs: "secreto", minePassed: true, revealed: true });
  });

  it("reveals by itself after the wait", async () => {
    const id = await open(w);
    const { asker, other } = await askFirstCard(id);
    await answerRound(id, asker, { round: 0, body: "hola" }, w.deps());
    w.advance(SETTINGS.rounds.revealHours * 3_600_000);
    const view = await getConversation(id, other, w.deps());
    expect(view.ok && view.value.rounds[0]).toMatchObject({ theirs: "hola", revealed: true });
  });

  it("refuses own questions before free chat and unknown cards", async () => {
    const id = await open(w);
    const asker = await askerOf(w, id);
    expect(await askQuestion(id, asker, { customText: "¿Qué te gusta?" }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(await askQuestion(id, asker, { promptId: "p999" }, w.deps())).toEqual({ ok: false, error: "request.invalid" });
  });

  it("offers free chat only after the minimum of rounds and both acceptances", async () => {
    const id = await open(w);
    expect(await setFreeChat(id, ANA, true, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    await playRounds(w, id, SETTINGS.rounds.minForFree);
    const half = await setFreeChat(id, ANA, true, w.deps());
    expect(half.ok && half.value).toMatchObject({ stage: "rounds", free: { mine: true, theirs: false } });
    const beaView = await getConversation(id, BEA, w.deps());
    expect(beaView.ok && beaView.value.free).toEqual({ canAccept: true, mine: false, theirs: false });
    const both = await setFreeChat(id, BEA, true, w.deps());
    expect(both.ok && both.value.stage).toBe("free");
  });

  it("lets anyone write their own question once the chat is free", async () => {
    const id = await open(w);
    await playRounds(w, id, SETTINGS.rounds.minForFree);
    await setFreeChat(id, ANA, true, w.deps());
    await setFreeChat(id, BEA, true, w.deps());
    const asker = await askerOf(w, id);
    const own = await askQuestion(id, asker, { customText: "¿Qué plan harías el sábado?" }, w.deps());
    expect(own.ok && own.value.rounds.at(-1)?.question).toBe("¿Qué plan harías el sábado?");
  });
});

describe("privacy", () => {
  it("never serialises user ids, sealed answers or the hidden wing", async () => {
    const id = await open(w);
    const view = await getConversation(id, ANA, w.deps());
    const json = JSON.stringify(view);
    expect(json).not.toContain(ANA);
    expect(json).not.toContain(BEA);
    expect(view.ok && view.value.peer).toEqual({ alias: "Nutria Serena", animal_id: "nutria", color_id: "ennea-2", color_hex: expect.any(String), mark: null });
    expect(JSON.stringify(await getInbox(ANA, w.deps()))).not.toContain(BEA);
    expect(await getConversation(id, EVE, w.deps())).toEqual({ ok: false, error: "chat.not_found" });
  });

  it("keeps the notification free of content", () => {
    expect(`${CHAT_NOTICE.title} ${CHAT_NOTICE.body}`).not.toMatch(/Nutria|Zorro|alias|mensaje:/);
  });
});
