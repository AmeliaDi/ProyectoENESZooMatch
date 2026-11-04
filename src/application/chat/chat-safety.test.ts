import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";

import { ANA, BEA, handle, open, playRounds, world, type World } from "../testing/chat-world";
import {
  blockInConversation,
  deleteMyMessages,
  expressInterest,
  getConversation,
  leaveConversation,
  reactToAnswer,
  reportConversation,
  roundFeedback,
  sendMessage,
  setFreeChat,
  setMuted,
  setPaused,
} from "./index";

const SETTINGS = CHAT_CONFIG.conversation;
let w: World;
let key = 0;
const clientKey = () => `00000000-0000-4000-9000-${String((key += 1)).padStart(12, "0")}`;

async function freeChat(): Promise<string> {
  const id = await open(w);
  await playRounds(w, id, SETTINGS.rounds.minForFree);
  await setFreeChat(id, ANA, true, w.deps());
  await setFreeChat(id, BEA, true, w.deps());
  return id;
}

beforeEach(() => {
  w = world();
});

describe("free chat messages", () => {
  it("delivers once per client key (idempotent retries)", async () => {
    const id = await freeChat();
    const k = clientKey();
    await sendMessage(id, ANA, { body: "¡Hola!", clientKey: k }, w.deps());
    const again = await sendMessage(id, ANA, { body: "¡Hola!", clientKey: k }, w.deps());
    expect(again.ok && again.value.messages).toHaveLength(1);
  });

  it("blocks links and offensive words, and allows contact data with the client-side notice", async () => {
    const id = await freeChat();
    expect(await sendMessage(id, ANA, { body: "mira www.algo.com", clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "chat.link_blocked" });
    expect(await sendMessage(id, ANA, { body: "eres un imbécil", clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "chat.offensive" });
    const phone = await sendMessage(id, ANA, { body: "mi cel 5512345678", clientKey: clientKey() }, w.deps());
    expect(phone.ok).toBe(true);
  });

  it("applies the grapheme limit and the per-minute cap and refuses repeats", async () => {
    const id = await freeChat();
    const tooLong = "a".repeat(SETTINGS.messageChars + 1);
    expect(await sendMessage(id, ANA, { body: tooLong, clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "request.invalid" });
    for (let i = 0; i < SETTINGS.limits.repeatWindow; i += 1) await sendMessage(id, ANA, { body: "igual", clientKey: clientKey() }, w.deps());
    expect(await sendMessage(id, ANA, { body: "igual", clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "chat.repeated" });
    const fresh = world();
    w = fresh;
    const other = await freeChat();
    for (let i = 0; i < SETTINGS.limits.messagesPerMinute; i += 1) await sendMessage(other, BEA, { body: `m${i}`, clientKey: clientKey() }, w.deps());
    expect(await sendMessage(other, BEA, { body: "uno más", clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "chat.slow_down" });
  });

  it("deletes only the viewer's own side", async () => {
    const id = await freeChat();
    await sendMessage(id, ANA, { body: "mío", clientKey: clientKey() }, w.deps());
    await sendMessage(id, BEA, { body: "suyo", clientKey: clientKey() }, w.deps());
    const after = await deleteMyMessages(id, ANA, w.deps());
    expect(after.ok && after.value.messages.map((m) => m.body)).toEqual(["suyo"]);
  });
});

describe("reactions and feedback", () => {
  it("reacts only with configured emojis and records feedback once, aggregated", async () => {
    const id = await open(w);
    await playRounds(w, id, 1);
    expect(await reactToAnswer(id, ANA, { round: 0, emoji: "\u{1F4A9}" }, w.deps())).toEqual({ ok: false, error: "request.invalid" });
    const reacted = await reactToAnswer(id, ANA, { round: 0, emoji: SETTINGS.reactions[0]! }, w.deps());
    expect(reacted.ok && reacted.value.rounds[0]?.myReaction).toBe(SETTINGS.reactions[0]);
    const bea = await getConversation(id, BEA, w.deps());
    expect(bea.ok && bea.value.rounds[0]?.theirReaction).toBe(SETTINGS.reactions[0]);
    await roundFeedback(id, ANA, { round: 0, liked: true }, w.deps());
    expect(await roundFeedback(id, ANA, { round: 0, liked: true }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(w.store.feedback).toEqual({ liked: 1, notLiked: 0 });
  });
});

describe("safety", () => {
  it("pauses for both; only who paused resumes", async () => {
    const id = await freeChat();
    await setPaused(id, BEA, true, w.deps());
    expect(await sendMessage(id, ANA, { body: "hola", clientKey: clientKey() }, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    expect(await setPaused(id, ANA, false, w.deps())).toEqual({ ok: false, error: "chat.conflict" });
    const resumed = await setPaused(id, BEA, false, w.deps());
    expect(resumed.ok && resumed.value.stage).toBe("free");
  });

  it("muting stops the notices to the viewer only", async () => {
    const id = await freeChat();
    await setMuted(id, BEA, true, w.deps());
    const before = w.store.notified.length;
    await sendMessage(id, ANA, { body: "hola", clientKey: clientKey() }, w.deps());
    expect(w.store.notified.length).toBe(before);
  });

  it("closing deletes everything, notifies nobody and cools the pair down", async () => {
    const id = await freeChat();
    const notified = w.store.notified.length;
    expect(await leaveConversation(id, BEA, w.deps())).toEqual({ ok: true, value: undefined });
    expect(w.store.conversations.size).toBe(0);
    expect(w.store.notified.length).toBe(notified);
    const again = await expressInterest(ANA, { match: handle(ANA, BEA), track: "amistad" }, w.deps());
    expect(again).toEqual({ ok: false, error: "chat.cooldown" });
  });

  it("blocking is silent and reads as a vanished match to the other person", async () => {
    const id = await freeChat();
    await blockInConversation(id, BEA, w.deps());
    expect(await getConversation(id, ANA, w.deps())).toEqual({ ok: false, error: "chat.not_found" });
    const again = await expressInterest(ANA, { match: handle(ANA, BEA), track: "romance" }, w.deps());
    expect(again).toEqual({ ok: false, error: "chat.match_gone" });
  });

  it("reporting keeps a minimal snapshot by role (no ids) and blocks", async () => {
    const id = await freeChat();
    await sendMessage(id, ANA, { body: "algo feo", clientKey: clientKey() }, w.deps());
    await reportConversation(id, BEA, "acoso", w.deps());
    expect(w.store.reports).toHaveLength(1);
    expect(w.store.reports[0]?.snapshot).toEqual([{ who: "reportada", body: "algo feo" }]);
    expect(JSON.stringify(w.store.reports[0]?.snapshot)).not.toContain(ANA);
    expect(w.store.conversations.size).toBe(0);
  });
});
