/**
 * Defensive parsers for the chat wire contracts (src/contracts/chat.ts). The
 * client never trusts the JSON: every field is type-checked, invalid entries
 * are dropped and a reply missing its core fields parses to `null`. A peer is
 * the stored identity read through `parseIdentity()`, so an egg — which has no
 * name and cannot chat — is never a parseable peer.
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
  InvitationDto,
  PromptCardDto,
  RoundDto,
} from "@/contracts/chat";
import { isHatched, parseIdentity } from "@/ui/shared/parse-identity";

type Json = Record<string, unknown>;

const TRACKS: readonly ChatTrack[] = ["romance", "amistad"];
const STAGES: readonly ConversationStage[] = ["rounds", "free", "paused"];
const INTEREST_KEY = /^(romance|amistad):.+$/;
const SETTINGS = CHAT_CONFIG.conversation;

export type InboxEntry = InboxEntryDto;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return options.find((option) => option === value) ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

const maybeText = (value: unknown): string | null => (typeof value === "string" ? value : null);

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
  const identity = parseIdentity(value.identity);
  return isHatched(identity) ? { identity } : null;
}

export function parseInboxEntry(value: unknown): InboxEntry | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const track = oneOf(TRACKS, value.track);
  const stage = oneOf(STAGES, value.stage);
  const peer = parsePeer(value.peer);
  if (id === null || track === null || stage === null || peer === null) return null;
  return {
    id, track, peer, stage,
    completedRounds: count(value.completedRounds) ?? 0,
    unread: value.unread === true,
    myTurn: value.myTurn === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function parseInvitation(value: unknown): InvitationDto | null {
  if (!isRecord(value)) return null;
  const match = text(value.match);
  const track = oneOf(TRACKS, value.track);
  const peer = parsePeer(value.peer);
  return match === null || track === null || peer === null ? null : { match, track, peer };
}

export function parseInbox(value: unknown): { conversations: InboxEntry[]; invitations: InvitationDto[] } | null {
  if (!isRecord(value) || !Array.isArray(value.conversations)) return null;
  return { conversations: listOf(value.conversations, parseInboxEntry), invitations: listOf(value.invitations, parseInvitation) };
}

/**
 * Whose move it is, for the row and the tallies beside «Tus conversaciones».
 *
 * The server's `myTurn` means "the viewer can act right now", so when it is
 * false inside the guided stage the move is by construction the other side's:
 * an answer they still owe on the open round, or the next question they get to
 * choose. `free` and `paused` have no turn to name, so those rows stay quiet —
 * and nothing here ever says how long anyone has taken (docs/CHAT.md §11, sin
 * presión).
 */
export function turnOf(entry: InboxEntry): "mine" | "theirs" | null {
  if (entry.myTurn) return "mine";
  return entry.stage === "rounds" ? "theirs" : null;
}

export function parseRound(value: unknown): RoundDto | null {
  if (!isRecord(value)) return null;
  const index = count(value.index);
  const question = text(value.question);
  if (index === null || question === null) return null;
  const revealsAt = maybeText(value.revealsAt);
  return {
    index,
    question,
    askedByMe: value.askedByMe === true,
    mine: maybeText(value.mine),
    minePassed: value.minePassed === true,
    theirs: maybeText(value.theirs),
    theirsPassed: value.theirsPassed === true,
    revealed: value.revealed === true,
    ...(revealsAt ? { revealsAt } : {}),
    myReaction: maybeText(value.myReaction),
    theirReaction: maybeText(value.theirReaction),
    feedbackGiven: value.feedbackGiven === true,
  };
}

export function parseMessage(value: unknown): ChatMessageDto | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (id === null || typeof value.body !== "string" || typeof value.at !== "string") return null;
  return { id, mine: value.mine === true, body: value.body, at: value.at };
}

function parseCard(value: unknown): PromptCardDto | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const cardText = text(value.text);
  return id === null || cardText === null ? null : { id, text: cardText, category: maybeText(value.category) ?? "" };
}

function parseAsk(value: unknown): ConversationDto["ask"] {
  if (!isRecord(value)) return null;
  return { suggestions: listOf(value.suggestions, parseCard), refresh: count(value.refresh) ?? 0, canWriteOwn: value.canWriteOwn === true };
}

function parseLimits(value: unknown): ConversationDto["limits"] {
  const limits = isRecord(value) ? value : {};
  return {
    answerChars: positive(limits.answerChars) ?? SETTINGS.answerChars,
    messageChars: positive(limits.messageChars) ?? SETTINGS.messageChars,
    customQuestionChars: positive(limits.customQuestionChars) ?? SETTINGS.customQuestionChars,
  };
}

function parseFree(value: unknown): ConversationDto["free"] {
  const free = isRecord(value) ? value : {};
  return { canAccept: free.canAccept === true, mine: free.mine === true, theirs: free.theirs === true };
}

export function parseConversation(value: unknown): ConversationDto | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const track = oneOf(TRACKS, value.track);
  const stage = oneOf(STAGES, value.stage);
  const peer = parsePeer(value.peer);
  if (id === null || track === null || stage === null || peer === null) return null;
  const me = parsePeer(value.me);
  const reactions = listOf(value.reactions, (r) => (typeof r === "string" && r.length > 0 ? r : null));
  return {
    id, track, peer,
    ...(me ? { me } : {}),
    stage,
    pausedByMe: value.pausedByMe === true,
    muted: value.muted === true,
    rounds: listOf(value.rounds, parseRound),
    completedRounds: count(value.completedRounds) ?? 0,
    minRoundsForFree: positive(value.minRoundsForFree) ?? SETTINGS.rounds.minForFree,
    ask: parseAsk(value.ask),
    free: parseFree(value.free),
    messages: listOf(value.messages, parseMessage),
    hasOlder: value.hasOlder === true,
    limits: parseLimits(value.limits),
    reactions: reactions.length > 0 ? reactions : [...SETTINGS.reactions],
  };
}

export function parseInterestState(value: unknown): InterestStateDto | null {
  if (!isRecord(value)) return null;
  if (value.state === "sent") return { state: "sent" };
  if (value.state === "invited") return { state: "invited" };
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
  return { states, adult: value.adult === true };
}

export function parseOk(value: unknown): true | null {
  return isRecord(value) && value.ok === true ? true : null;
}
