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

const SETTINGS = CHAT_CONFIG.conversation;
const peer = { alias: "Nutria Serena", animal_id: "nutria", color_id: "ennea-2", color_hex: "#AABBCC", mark: "sx" };
const entry = { id: "c1", track: "romance", peer, stage: "rounds", completedRounds: 2, unread: true, myTurn: false, updatedAt: "2026-11-01T10:00:00Z" };
const round = {
  index: 0, question: "¿Qué te alegra?", askedByMe: true, mine: "Los gatos", minePassed: false,
  theirs: null, theirsPassed: false, revealed: false, revealsAt: "2026-11-03T10:00:00Z",
  myReaction: null, theirReaction: null, feedbackGiven: false,
};
const convo = {
  id: "c1", track: "amistad", peer, stage: "rounds", pausedByMe: false, muted: false,
  rounds: [round], completedRounds: 0, minRoundsForFree: 3,
  ask: null, free: { canAccept: false, mine: false, theirs: false },
  messages: [], hasOlder: false,
  limits: { answerChars: 300, messageChars: 300, customQuestionChars: 200 },
  reactions: ["\u2728"],
};

describe("parsePeer", () => {
  it("keeps valid fields and nulls the doubtful ones", () => {
    expect(parsePeer(peer)).toEqual(peer);
    expect(parsePeer({ ...peer, color_hex: "red", mark: "xx", animal_id: 7 })).toMatchObject({ color_hex: null, mark: null, animal_id: null });
  });

  it("rejects a peer without alias", () => {
    expect(parsePeer({ ...peer, alias: "  " })).toBeNull();
    expect(parsePeer(null)).toBeNull();
  });
});

describe("parseInbox", () => {
  it("drops invalid entries and invitations instead of failing the whole list", () => {
    const parsed = parseInbox({
      conversations: [entry, { ...entry, id: 3 }, { ...entry, stage: "chat" }, "x"],
      invitations: [{ match: "h1", track: "amistad", peer }, { match: "h2", track: "otro", peer }],
    });
    expect(parsed?.conversations).toHaveLength(1);
    expect(parsed?.invitations).toEqual([{ match: "h1", track: "amistad", peer }]);
  });

  it("treats non-true flags as false", () => {
    expect(parseInboxEntry({ ...entry, unread: "yes", myTurn: 1, completedRounds: -1 })).toMatchObject({ unread: false, myTurn: false, completedRounds: 0 });
  });

  it("returns null when the list itself is missing", () => {
    expect(parseInbox({})).toBeNull();
    expect(parseInbox({ conversations: "nope" })).toBeNull();
  });
});

describe("parseConversation", () => {
  it("parses a full conversation", () => {
    expect(parseConversation(convo)).toEqual(convo);
  });

  it("falls back to config and drops bad rounds, cards and messages", () => {
    const parsed = parseConversation({
      ...convo,
      limits: { answerChars: -1 },
      rounds: [round, { index: 1 }, { ...round, index: 2, mine: 3 }],
      ask: { suggestions: [{ id: "p001", text: "¿Hola?" }, { id: 4 }], refresh: "x" },
      messages: [{ id: "m1", mine: true, body: "hola", at: "2026" }, { id: "m2", body: 5, at: "2026" }],
      free: "both",
      reactions: [],
    });
    expect(parsed?.limits).toEqual({ answerChars: SETTINGS.answerChars, messageChars: SETTINGS.messageChars, customQuestionChars: SETTINGS.customQuestionChars });
    expect(parsed?.rounds.map((r) => r.index)).toEqual([0, 2]);
    expect(parsed?.rounds[1]?.mine).toBeNull();
    expect(parsed?.ask).toEqual({ suggestions: [{ id: "p001", text: "¿Hola?", category: "" }], refresh: 0, canWriteOwn: false });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.free).toEqual({ canAccept: false, mine: false, theirs: false });
    expect(parsed?.reactions).toEqual([...SETTINGS.reactions]);
  });

  it("rejects a conversation missing its core fields", () => {
    expect(parseConversation({ ...convo, id: "" })).toBeNull();
    expect(parseConversation({ ...convo, stage: "invite" })).toBeNull();
    expect(parseConversation({ ...convo, peer: null })).toBeNull();
    expect(parseConversation("x")).toBeNull();
  });
});

describe("round and message parsers", () => {
  it("require their identifying fields", () => {
    expect(parseRound({ index: 1.5, question: "q" })).toBeNull();
    expect(parseRound({ index: 0, question: "q" })).toMatchObject({ index: 0, question: "q", mine: null, theirs: null, revealed: false });
    expect(parseMessage({ id: "m", body: "", at: "t" })).toEqual({ id: "m", mine: false, body: "", at: "t" });
    expect(parseMessage({ id: "m", body: "x" })).toBeNull();
  });
});

describe("interest parsers", () => {
  it("accepts only the known states", () => {
    expect(parseInterestState({ state: "sent" })).toEqual({ state: "sent" });
    expect(parseInterestState({ state: "invited" })).toEqual({ state: "invited" });
    expect(parseInterestState({ state: "open", conversation: "c9" })).toEqual({ state: "open", conversation: "c9" });
    expect(parseInterestState({ state: "open" })).toBeNull();
    expect(parseInterestState({ state: "declined" })).toBeNull();
  });

  it("filters invalid keys and states and reads the adult flag strictly", () => {
    const parsed = parseInterestStates({
      states: { "romance:abc": { state: "sent" }, "otro:abc": { state: "sent" }, "amistad:x": { state: 1 }, "amistad:": { state: "sent" } },
      adult: "yes",
    });
    expect(parsed).toEqual({ states: { "romance:abc": { state: "sent" } }, adult: false });
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
  });
});
