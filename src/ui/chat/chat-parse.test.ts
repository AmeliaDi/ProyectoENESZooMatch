import { describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import { formatIdentity } from "@/domain/identity/format-identity";
import { EGG_IDENTITY } from "@/ui/shared/parse-identity";

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
  turnOf,
  type InboxEntry,
} from "./chat-parse";
import { hasInterestHandle, interestKey } from "./interest-api";

const SETTINGS = CHAT_CONFIG.conversation;
/** A hatched identity as the server stores and projects it. */
const identity: IdentityDto = {
  estadoIdentidad: "eclosionado",
  aliasCompleto: "nutria verde esmeralda · KMPQ",
  aliasAnimal: "nutria",
  aliasColor: "verde esmeralda",
  aliasSufijo: "KMPQ",
  animalId: "nutria",
  colorId: "ennea-2",
  colorHex: "#AABBCC",
  mbtiCode: "INFP",
  enneagramCode: "4w5",
  enneagramName: "El Individualista",
  mark: "sx",
  revelacionVista: false,
  huevitoSeed: null,
};
const peer = { identity };
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
  it("keeps the stored identity and nulls the doubtful fields", () => {
    expect(parsePeer(peer)).toEqual(peer);
    const doubtful = { identity: { ...identity, colorHex: "red", mark: "xx", mbtiCode: "XXXX", enneagramCode: "10" } };
    expect(parsePeer(doubtful)).toMatchObject({
      identity: { colorHex: null, mark: null, mbtiCode: null, enneagramCode: null, animalId: "nutria" },
    });
  });

  it("never yields a peer without a renderable identity", () => {
    expect(parsePeer({ identity: EGG_IDENTITY })).toBeNull();
    expect(parsePeer({ identity: { ...EGG_IDENTITY, huevitoSeed: 7 } })).toBeNull();
    expect(parsePeer({ identity: { ...identity, aliasCompleto: "  " } })).toBeNull();
    expect(parsePeer({ identity: { ...identity, aliasCompleto: "sin separador", aliasSufijo: null } })).toBeNull();
    // A hand-built name is not an identity: the old wire shape parses to nothing.
    expect(parsePeer({ alias: identity.aliasCompleto, animal_id: "nutria", color_id: "ennea-2" })).toBeNull();
    expect(parsePeer(null)).toBeNull();
  });
});

describe("parseInbox", () => {
  it("drops invalid entries and invitations instead of failing the whole list", () => {
    const egg = { identity: EGG_IDENTITY };
    const parsed = parseInbox({
      conversations: [entry, { ...entry, id: 3 }, { ...entry, stage: "chat" }, { ...entry, id: "c2", peer: egg }, "x"],
      invitations: [{ match: "h1", track: "amistad", peer }, { match: "h2", track: "otro", peer }, { match: "h3", track: "romance", peer: egg }],
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

describe("turnOf", () => {
  function row(over: Record<string, unknown>): InboxEntry {
    const parsed = parseInboxEntry({ ...entry, ...over });
    if (parsed === null) throw new Error("fixture should parse");
    return parsed;
  }

  it("names the viewer whenever the server says they can act", () => {
    expect(turnOf(row({ myTurn: true, stage: "rounds" }))).toBe("mine");
    expect(turnOf(row({ myTurn: true, stage: "free" }))).toBe("mine");
  });

  it("names the other side only while the guided rounds are open", () => {
    expect(turnOf(row({ myTurn: false, stage: "rounds" }))).toBe("theirs");
    expect(turnOf(row({ myTurn: false, stage: "free" }))).toBeNull();
    expect(turnOf(row({ myTurn: false, stage: "paused" }))).toBeNull();
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
      ask: { suggestions: [{ id: "p001", text: "¿Hola?" }, { id: "c1", text: "¿Qué playlist te sabes?", origin: "coincidence" }, { id: 4 }], refresh: "x" },
      messages: [{ id: "m1", mine: true, body: "hola", at: "2026" }, { id: "m2", body: 5, at: "2026" }],
      free: "both",
      reactions: [],
    });
    expect(parsed?.limits).toEqual({ answerChars: SETTINGS.answerChars, messageChars: SETTINGS.messageChars, customQuestionChars: SETTINGS.customQuestionChars });
    expect(parsed?.rounds.map((r) => r.index)).toEqual([0, 2]);
    expect(parsed?.rounds[1]?.mine).toBeNull();
    expect(parsed?.ask).toEqual({ suggestions: [{ id: "p001", text: "¿Hola?", category: "", origin: "bank" }, { id: "c1", text: "¿Qué playlist te sabes?", category: "", origin: "coincidence" }], refresh: 0, canWriteOwn: false });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.free).toEqual({ canAccept: false, mine: false, theirs: false });
    expect(parsed?.reactions).toEqual([...SETTINGS.reactions]);
  });

  it("rejects a conversation missing its core fields", () => {
    expect(parseConversation({ ...convo, id: "" })).toBeNull();
    expect(parseConversation({ ...convo, stage: "invite" })).toBeNull();
    expect(parseConversation({ ...convo, peer: null })).toBeNull();
    expect(parseConversation({ ...convo, peer: { identity: EGG_IDENTITY } })).toBeNull();
    expect(parseConversation("x")).toBeNull();
  });

  it("renders the peer with the one canonical name and its own aria-label", () => {
    const name = formatIdentity(parsePeer(peer)?.identity ?? EGG_IDENTITY);
    expect(name.isEgg).toBe(false);
    expect(name.title).toBe("nutria verde esmeralda · KMPQ");
    expect(name.shortName).toBe("nutria verde esmeralda");
    expect(name.suffix).toBe("KMPQ");
    expect(name.subtitle).toBe("INFP · 4w5");
    expect(name.ariaLabel).toBe(name.title);
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
