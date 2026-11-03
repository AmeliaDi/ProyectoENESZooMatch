/**
 * Defensive parsers for the chat wire contracts (src/contracts/chat.ts). The
 * client never trusts the JSON: every field is type-checked, invalid entries
 * are dropped and a reply missing its core fields parses to `null`.
 */
import { CHAT_CONFIG } from "@/config";
import type {
  ChatMessageDto,
  ChatPeerDto,
  ChatTrack,
  ConversationDto,
  ConversationStage,
  InboxEntryDto,
  InterestStateDto,
  InterestStatesDto,
  RoundDto,
} from "@/contracts/chat";
import type { SpriteMark } from "@/contracts/result";

type Json = Record<string, unknown>;

const TRACKS: readonly ChatTrack[] = ["romance", "amistad"];
const STAGES: readonly ConversationStage[] = ["rounds", "invite", "free"];
const MARKS: readonly SpriteMark[] = ["sp", "so", "sx"];
const HEX = /^#[0-9a-f]{6}$/i;
const INTEREST_KEY = /^(romance|amistad):.+$/;

/** Inbox entry plus the round progress, if the server ever sends it (optional, 1-based). */
export interface InboxEntry extends Omit<InboxEntryDto, "round" | "totalRounds"> {
  progress: { round: number; total: number } | null;
}

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return options.find((option) => option === value) ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function positive(value: unknown): number | null {
  const n = count(value);
  return n !== null && n > 0 ? n : null;
}

function listOf<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((item): item is T => item !== null);
}

export function parsePeer(value: unknown): ChatPeerDto | null {
  if (!isRecord(value)) return null;
  const alias = text(value.alias);
  if (alias === null) return null;
  const hex = typeof value.color_hex === "string" && HEX.test(value.color_hex) ? value.color_hex : null;
  return {
    alias,
    animal_id: text(value.animal_id),
    color_id: text(value.color_id),
    color_hex: hex,
    mark: oneOf(MARKS, value.mark),
  };
}

function parseProgress(value: Json): InboxEntry["progress"] {
  const round = positive(value.round);
  const total = positive(value.totalRounds);
  return round !== null && total !== null && round <= total ? { round, total } : null;
}

export function parseInboxEntry(value: unknown): InboxEntry | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const track = oneOf(TRACKS, value.track);
  const stage = oneOf(STAGES, value.stage);
  const peer = parsePeer(value.peer);
  if (id === null || track === null || stage === null || peer === null) return null;
  return {
    id,
    track,
    peer,
    stage,
    unread: value.unread === true,
    myTurn: value.myTurn === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    progress: parseProgress(value),
  };
}

export function parseInbox(value: unknown): { conversations: InboxEntry[] } | null {
  if (!isRecord(value) || !Array.isArray(value.conversations)) return null;
  return { conversations: listOf(value.conversations, parseInboxEntry) };
}

export function parseRound(value: unknown): RoundDto | null {
  if (!isRecord(value)) return null;
  const index = count(value.index);
  const question = text(value.question);
  if (index === null || question === null) return null;
  return {
    index,
    question,
    mine: typeof value.mine === "string" ? value.mine : null,
    theirs: typeof value.theirs === "string" ? value.theirs : null,
  };
}

export function parseMessage(value: unknown): ChatMessageDto | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (id === null || typeof value.body !== "string" || typeof value.at !== "string") return null;
  return { id, mine: value.mine === true, body: value.body, at: value.at };
}

function parseLimits(value: unknown): ConversationDto["limits"] {
  const limits = isRecord(value) ? value : {};
  return {
    answerChars: positive(limits.answerChars) ?? CHAT_CONFIG.conversation.answerChars,
    messageChars: positive(limits.messageChars) ?? CHAT_CONFIG.conversation.messageChars,
  };
}

export function parseConversation(value: unknown): ConversationDto | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const track = oneOf(TRACKS, value.track);
  const stage = oneOf(STAGES, value.stage);
  const peer = parsePeer(value.peer);
  if (id === null || track === null || stage === null || peer === null) return null;
  const rounds = listOf(value.rounds, parseRound);
  const ready = isRecord(value.freeReady) ? value.freeReady : {};
  return {
    id,
    track,
    peer,
    stage,
    rounds,
    totalRounds: Math.max(count(value.totalRounds) ?? 0, rounds.length),
    currentRound: count(value.currentRound),
    freeReady: { mine: ready.mine === true, theirs: ready.theirs === true },
    messages: listOf(value.messages, parseMessage),
    limits: parseLimits(value.limits),
  };
}

export function parseInterestState(value: unknown): InterestStateDto | null {
  if (!isRecord(value)) return null;
  if (value.state === "sent") return { state: "sent" };
  const conversation = text(value.conversation);
  return value.state === "open" && conversation !== null ? { state: "open", conversation } : null;
}

export function parseInterestStates(value: unknown): InterestStatesDto | null {
  if (!isRecord(value) || !isRecord(value.states)) return null;
  const states: Record<string, InterestStateDto> = {};
  for (const [key, raw] of Object.entries(value.states)) {
    const state = parseInterestState(raw);
    if (state !== null && INTEREST_KEY.test(key)) states[key] = state;
  }
  return { states };
}

export function parseOk(value: unknown): true | null {
  return isRecord(value) && value.ok === true ? true : null;
}
