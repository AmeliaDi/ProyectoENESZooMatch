import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import { formatIdentity } from "@/domain/identity/format-identity";
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
  sendMessage,
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
      {
        match: handle(BEA, ANA),
        track: "amistad",
        peer: { identity: expect.objectContaining({ aliasCompleto: "zorro calmo · DRRS" }) },
      },
    ]);
    const invitation = inbox.ok ? inbox.value.invitations[0]?.peer : undefined;
    expect(invitation && formatIdentity(invitation.identity).title).toBe("zorro calmo · DRRS");
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

  it("transitions automatically to free chat after round 3 and rejects free messages in rounds 1 or 2", async () => {
    const id = await open(w);
    const key1 = "00000000-0000-4000-9000-000000000001";
    // Round 0 (Question 1): free message rejected
    expect(await sendMessage(id, ANA, { body: "antes de tiempo", clientKey: key1 }, w.deps())).toEqual({
      ok: false,
      error: "chat.not_allowed",
    });
    await playRounds(w, id, 1);
    // Round 1 (Question 2): free message rejected
    expect(await sendMessage(id, BEA, { body: "ronda 2", clientKey: key1 }, w.deps())).toEqual({
      ok: false,
      error: "chat.not_allowed",
    });
    await playRounds(w, id, 1);
    const afterTwo = await getConversation(id, ANA, w.deps());
    expect(afterTwo.ok && afterTwo.value.stage).toBe("rounds");
    // Complete Round 2 (Question 3): automatic transition to free chat without setFreeChat!
    await playRounds(w, id, 1);
    const afterThree = await getConversation(id, ANA, w.deps());
    expect(afterThree.ok && afterThree.value.stage).toBe("free");
    expect(afterThree.ok && afterThree.value.completedRounds).toBe(3);
    expect(afterThree.ok && afterThree.value.ask).toBeNull();

    // Free message of 300 graphemes (including emojis & accents) is accepted; 301 is rejected
    const familyEmoji = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const msg300 = `¡Canción café! ${familyEmoji} ` + "a".repeat(300 - 17);
    const sent300 = await sendMessage(id, ANA, { body: msg300, clientKey: key1 }, w.deps());
    expect(sent300.ok).toBe(true);
    expect(sent300.ok && sent300.value.messages).toHaveLength(1);

    const msg301 = msg300 + "z";
    const key2 = "00000000-0000-4000-9000-000000000002";
    expect(await sendMessage(id, ANA, { body: msg301, clientKey: key2 }, w.deps())).toEqual({
      ok: false,
      error: "request.invalid",
    });
  });

  it("rejects opening round 4 (idx >= 3) after the 3 guided questions", async () => {
    const id = await open(w);
    await playRounds(w, id, 3);
    expect(await askQuestion(id, ANA, { promptId: "p001" }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(await askQuestion(id, BEA, { promptId: "p002" }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(await askQuestion(id, ANA, { customText: "¿Ronda 4?" }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
  });

  it("migrates ongoing conversations: < 3 rounds stay in rounds, >= 3 rounds enter free chat keeping messages", async () => {
    const idUnder = await open(w, "amistad");
    await playRounds(w, idUnder, 2);
    const viewUnder = await getConversation(idUnder, ANA, w.deps());
    expect(viewUnder.ok && viewUnder.value.stage).toBe("rounds");

    await confirmAdult(ANA, w.deps());
    await confirmAdult(BEA, w.deps());
    const idOver = await open(w, "romance");
    await playRounds(w, idOver, 3);
    // Simulate a pre-migration row where freeReadyA/freeReadyB were still false in DB
    const row = w.store.conversations.get(idOver)!;
    row.freeReadyA = false;
    row.freeReadyB = false;
    w.store.messages.push({
      id: "m-legacy-1",
      conversationId: idOver,
      author: ANA,
      body: "mensaje previo conservado",
      clientKey: "00000000-0000-4000-9000-000000000099",
      at: new Date(),
    });
    const viewOver = await getConversation(idOver, BEA, w.deps());
    expect(viewOver.ok && viewOver.value.stage).toBe("free");
    expect(viewOver.ok && viewOver.value.messages.map((m) => m.body)).toEqual(["mensaje previo conservado"]);
  });
});

describe("privacy", () => {
  it("never serialises user ids, sealed answers or the hidden wing", async () => {
    const id = await open(w);
    const view = await getConversation(id, ANA, w.deps());
    const json = JSON.stringify(view);
    expect(json).not.toContain(ANA);
    expect(json).not.toContain(BEA);
    expect(view.ok && view.value.peer).toEqual({
      identity: expect.objectContaining({
        estadoIdentidad: "eclosionado",
        aliasCompleto: "nutria serena · KMPQ",
        animalId: "nutria",
        colorId: "ennea-2",
        colorHex: expect.any(String),
        mark: null,
      }),
    });
    expect(view.ok && formatIdentity(view.value.peer.identity).title).toBe("nutria serena · KMPQ");
    expect(JSON.stringify(await getInbox(ANA, w.deps()))).not.toContain(BEA);
    expect(await getConversation(id, EVE, w.deps())).toEqual({ ok: false, error: "chat.not_found" });
  });

  it("keeps the notification free of content", () => {
    expect(`${CHAT_NOTICE.title} ${CHAT_NOTICE.body}`).not.toMatch(/Nutria|Zorro|alias|mensaje:/);
  });
});
