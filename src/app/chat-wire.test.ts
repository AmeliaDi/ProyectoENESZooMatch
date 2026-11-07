/**
 * Wire contract of the chat: every DTO the use cases hand to a route must
 * survive the browser's defensive parsers. A peer the client cannot parse is
 * a conversation nobody can open, and the server-side name tests never caught
 * it because they read `aliasCompleto` straight from the DTO.
 */
import { describe, expect, it } from "vitest";

import {
  answerRound,
  askQuestion,
  confirmAdult,
  expressInterest,
  getConversation,
  getInbox,
  sendMessage,
} from "@/application/chat";
import { ANA, BEA, handle, open, playRounds, world } from "@/application/testing/chat-world";
import { formatIdentity } from "@/domain/identity/format-identity";
import { parseConversation, parseInbox } from "@/ui/chat/chat-parse";

describe("chat wire contract", () => {
  it("keeps the invitation the other person has to answer", async () => {
    const w = world();
    await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, w.deps());
    const inbox = await getInbox(BEA, w.deps());
    expect(inbox.ok).toBe(true);
    if (!inbox.ok) return;
    const parsed = parseInbox(JSON.parse(JSON.stringify(inbox.value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.invitations).toHaveLength(1);
    expect(parsed?.invitations[0]?.track).toBe("amistad");
  });

  it("lets both people open the conversation the server created", async () => {
    const w = world();
    const id = await open(w);
    for (const viewer of [ANA, BEA]) {
      const view = await getConversation(id, viewer, w.deps());
      expect(view.ok).toBe(true);
      if (!view.ok) continue;
      const wire = JSON.parse(JSON.stringify(view.value));
      const parsed = parseConversation(wire);
      expect(parsed, `la conversación no sobrevive al parser del navegador`).not.toBeNull();
      expect(parsed?.id).toBe(id);
      expect(formatIdentity(parsed!.peer.identity).title).toBe(formatIdentity(view.value.peer.identity).title);
    }
  });

  it("keeps every conversation of the inbox, on both tracks", async () => {
    const w = world();
    await confirmAdult(ANA, w.deps());
    await confirmAdult(BEA, w.deps());
    await open(w, "amistad");
    await open(w, "romance");
    const inbox = await getInbox(ANA, w.deps());
    expect(inbox.ok).toBe(true);
    if (!inbox.ok) return;
    expect(inbox.value.conversations).toHaveLength(2);
    const parsed = parseInbox(JSON.parse(JSON.stringify(inbox.value)));
    expect(parsed?.conversations).toHaveLength(2);
  });

  it("carries the free chat and its messages through the parser", async () => {
    const w = world();
    await confirmAdult(ANA, w.deps());
    await confirmAdult(BEA, w.deps());
    const id = await open(w, "romance");
    await playRounds(w, id, 3);
    const sent = await sendMessage(id, ANA, { body: "¿Te late un café? ☕", clientKey: w.store.nextId() }, w.deps());
    expect(sent.ok).toBe(true);
    const view = await getConversation(id, BEA, w.deps());
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const parsed = parseConversation(JSON.parse(JSON.stringify(view.value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("free");
    expect(parsed?.messages.map((m) => m.body)).toEqual(["¿Te late un café? ☕"]);
    expect(parsed?.rounds).toHaveLength(3);
  });

  it("keeps a sealed answer sealed after the round trip", async () => {
    const w = world();
    const id = await open(w);
    const view = await getConversation(id, ANA, w.deps());
    const asker = view.ok && view.value.ask ? ANA : BEA;
    const other = asker === ANA ? BEA : ANA;
    const cards = await getConversation(id, asker, w.deps());
    const card = cards.ok ? cards.value.ask?.suggestions[0] : undefined;
    expect(card).toBeDefined();
    await askQuestion(id, asker, { promptId: card!.id }, w.deps());
    await answerRound(id, asker, { round: 0, body: "respuesta sellada" }, w.deps());
    const theirs = await getConversation(id, other, w.deps());
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    const parsed = parseConversation(JSON.parse(JSON.stringify(theirs.value)));
    expect(parsed).not.toBeNull();
    expect(parsed?.rounds[0]?.theirs).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("respuesta sellada");
  });
});