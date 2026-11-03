import { describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";

import {
  parseConversation,
  parseInbox,
  parseInboxEntry,
  parseInterestState,
  parseInterestStates,
  parseMessage,
  parseOk,
  parsePeer,
  parseRound,
} from "./chat-parse";
import { hasInterestHandle, interestKey } from "./interest-api";

const peer = { alias: "Nutria Serena", animal_id: "nutria", color_id: "ennea-2", color_hex: "#AABBCC", mark: "sx" };
const entry = { id: "c1", track: "romance", peer, stage: "rounds", unread: true, myTurn: false, updatedAt: "2026-11-01T10:00:00Z" };
const convo = {
  id: "c1",
  track: "amistad",
  peer,
  stage: "invite",
  rounds: [{ index: 0, question: "¿Qué te alegra?", mine: "Los gatos", theirs: null }],
  totalRounds: 3,
  currentRound: null,
  freeReady: { mine: true, theirs: false },
  messages: [],
  limits: { answerChars: 280, messageChars: 500 },
};

describe("parsePeer", () => {
  it("keeps valid fields and nulls the doubtful ones", () => {
    expect(parsePeer(peer)).toEqual(peer);
    expect(parsePeer({ ...peer, color_hex: "red", mark: "xx", animal_id: 7 })).toMatchObject({
      color_hex: null, mark: null, animal_id: null,
    });
  });

  it("rejects a peer without alias", () => {
    expect(parsePeer({ ...peer, alias: "  " })).toBeNull();
    expect(parsePeer(null)).toBeNull();
    expect(parsePeer([peer])).toBeNull();
  });
});

describe("parseInbox", () => {
  it("drops invalid entries instead of failing the whole list", () => {
    const parsed = parseInbox({ conversations: [entry, { ...entry, id: 3 }, { ...entry, stage: "chat" }, "x"] });
    expect(parsed?.conversations).toHaveLength(1);
    expect(parsed?.conversations[0]).toMatchObject({ id: "c1", unread: true, myTurn: false, progress: null });
  });

  it("treats non-true flags as false and reads optional progress", () => {
    const parsed = parseInboxEntry({ ...entry, unread: "yes", myTurn: 1, round: 2, totalRounds: 3 });
    expect(parsed).toMatchObject({ unread: false, myTurn: false, progress: { round: 2, total: 3 } });
    expect(parseInboxEntry({ ...entry, round: 4, totalRounds: 3 })?.progress).toBeNull();
  });

  it("returns null when the list itself is missing", () => {
    expect(parseInbox({})).toBeNull();
    expect(parseInbox({ conversations: "nope" })).toBeNull();
  });
});

describe("parseConversation", () => {
  it("parses a full conversation", () => {
    expect(parseConversation(convo)).toEqual({ ...convo, track: "amistad" });
  });

  it("falls back to config limits and drops bad rounds and messages", () => {
    const parsed = parseConversation({
      ...convo,
      limits: { answerChars: -1 },
      rounds: [...convo.rounds, { index: 1 }, { index: 2, question: "¿Y tú?", mine: 3 }],
      messages: [{ id: "m1", mine: true, body: "hola", at: "2026" }, { id: "m2", body: 5, at: "2026" }],
      freeReady: "both",
      currentRound: -2,
    });
    expect(parsed?.limits).toEqual({
      answerChars: CHAT_CONFIG.conversation.answerChars,
      messageChars: CHAT_CONFIG.conversation.messageChars,
    });
    expect(parsed?.rounds.map((r) => r.index)).toEqual([0, 2]);
    expect(parsed?.rounds[1]?.mine).toBeNull();
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.freeReady).toEqual({ mine: false, theirs: false });
    expect(parsed?.currentRound).toBeNull();
  });

  it("never reports fewer total rounds than it shows", () => {
    expect(parseConversation({ ...convo, totalRounds: "3" })?.totalRounds).toBe(1);
  });

  it("rejects a conversation missing its core fields", () => {
    expect(parseConversation({ ...convo, id: "" })).toBeNull();
    expect(parseConversation({ ...convo, track: "otro" })).toBeNull();
    expect(parseConversation({ ...convo, peer: null })).toBeNull();
    expect(parseConversation("x")).toBeNull();
  });
});

describe("round and message parsers", () => {
  it("require their identifying fields", () => {
    expect(parseRound({ index: 1.5, question: "q" })).toBeNull();
    expect(parseRound({ index: 0, question: "q" })).toEqual({ index: 0, question: "q", mine: null, theirs: null });
    expect(parseMessage({ id: "m", body: "", at: "t" })).toEqual({ id: "m", mine: false, body: "", at: "t" });
    expect(parseMessage({ id: "m", body: "x" })).toBeNull();
  });
});

describe("interest parsers", () => {
  it("accepts only the two known states", () => {
    expect(parseInterestState({ state: "sent" })).toEqual({ state: "sent" });
    expect(parseInterestState({ state: "open", conversation: "c9" })).toEqual({ state: "open", conversation: "c9" });
    expect(parseInterestState({ state: "open" })).toBeNull();
    expect(parseInterestState({ state: "maybe" })).toBeNull();
  });

  it("filters invalid keys and states", () => {
    const parsed = parseInterestStates({
      states: { "romance:abc": { state: "sent" }, "otro:abc": { state: "sent" }, "amistad:x": { state: 1 }, "amistad:": { state: "sent" } },
    });
    expect(parsed).toEqual({ states: { "romance:abc": { state: "sent" } } });
    expect(parseInterestStates({ states: [] })).toBeNull();
  });

  it("parses the ok reply strictly", () => {
    expect(parseOk({ ok: true })).toBe(true);
    expect(parseOk({ ok: "true" })).toBeNull();
  });

  it("only offers the button for real handles", () => {
    expect(interestKey("amistad", "h1")).toBe("amistad:h1");
    expect(hasInterestHandle("h1", "romance")).toBe(true);
    expect(hasInterestHandle("romance-3", "romance")).toBe(false);
    expect(hasInterestHandle(null, "romance")).toBe(false);
    expect(hasInterestHandle("", "amistad")).toBe(false);
  });
});
