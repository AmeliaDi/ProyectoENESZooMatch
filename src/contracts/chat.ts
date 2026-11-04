/**
 * Wire contracts of the chat between matches (docs/CHAT.md §10–13). Shared
 * by the server (which builds them) and the client (which parses them).
 * Never carries user ids, matrícula hashes, the other person's sealed
 * answers, read receipts or anything about a declined signal.
 */
import type { SpriteMark } from "./result";

export type ChatTrack = "romance" | "amistad";

/**
 * `rounds`: guided questions with sealed answers (free chat can be proposed
 * after the minimum of rounds). `free`: free chat. `paused`: someone paused;
 * nothing can be written until whoever paused resumes.
 */
export type ConversationStage = "rounds" | "free" | "paused";

/** What the viewer may see of the other person (same rules as the result). */
export interface ChatPeerDto {
  alias: string;
  animal_id: string | null;
  color_id: string | null;
  color_hex: string | null;
  mark: SpriteMark | null;
}

export interface InboxEntryDto {
  /** Random conversation id; only its two participants can open it. */
  id: string;
  track: ChatTrack;
  peer: ChatPeerDto;
  stage: ConversationStage;
  /** Rounds already revealed. */
  completedRounds: number;
  /** Something from the other person the viewer has not opened yet. */
  unread: boolean;
  /** The viewer can act now (ask, answer, or accept free chat). */
  myTurn: boolean;
  updatedAt: string;
}

/** A signal received and not answered: "alguien con quien conectas quiere abrir un chat". */
export interface InvitationDto {
  /** Per-viewer match handle (same as MatchEntryDto.id). */
  match: string;
  track: ChatTrack;
  peer: ChatPeerDto;
}

export interface InboxDto {
  conversations: InboxEntryDto[];
  invitations: InvitationDto[];
}

export interface RoundDto {
  /** 0-based; the `round` sent to POST .../answer. */
  index: number;
  question: string;
  askedByMe: boolean;
  /** The viewer's own answer: text, "passed", or `null` if not answered yet. */
  mine: string | null;
  minePassed: boolean;
  /** The other answer: only once revealed, otherwise `null`. */
  theirs: string | null;
  theirsPassed: boolean;
  /** Both answered (or the reveal wait ended). */
  revealed: boolean;
  /** When a sealed round opens up by itself (ISO), only while sealed. */
  revealsAt?: string;
  /** The viewer's reaction to their answer, and theirs to the viewer's. */
  myReaction: string | null;
  theirReaction: string | null;
  /** The viewer already answered "¿te gustó la conversación?" for this round. */
  feedbackGiven: boolean;
}

export interface PromptCardDto {
  id: string;
  text: string;
  category: string;
}

export interface ChatMessageDto {
  id: string;
  mine: boolean;
  body: string;
  at: string;
}

export interface ConversationDto {
  id: string;
  track: ChatTrack;
  peer: ChatPeerDto;
  stage: ConversationStage;
  pausedByMe: boolean;
  muted: boolean;
  rounds: RoundDto[];
  completedRounds: number;
  minRoundsForFree: number;
  /** Cards the viewer may ask now; `null` when it is not their turn to ask. */
  ask: { suggestions: PromptCardDto[]; refresh: number; canWriteOwn: boolean } | null;
  /** Free-chat proposal; `theirs` is only revealed once the viewer accepted. */
  free: { canAccept: boolean; mine: boolean; theirs: boolean };
  /** Free-chat messages, oldest first (empty before the `free` stage). */
  messages: ChatMessageDto[];
  /** Older messages exist (page with `?before=<at>`). */
  hasOlder: boolean;
  /** Graphemes per answer / message / own question. */
  limits: { answerChars: number; messageChars: number; customQuestionChars: number };
  reactions: string[];
}

/**
 * Interest in one match, keyed by `${track}:${matchId}`. `invited`: the other
 * person signalled and the viewer has not answered (never shown to the sender).
 */
export type InterestStateDto =
  | { state: "sent" }
  | { state: "invited" }
  | { state: "open"; conversation: string };

export interface InterestStatesDto {
  states: Record<string, InterestStateDto>;
  /** The viewer confirmed being 18+ (needed for romance chats). */
  adult: boolean;
}

/** Body of POST/DELETE /api/interest and POST /api/interest/decline. */
export interface InterestRequestDto {
  match: string;
  track: ChatTrack;
}

export const REPORT_REASONS = ["acoso", "ofensivo", "datos_personales", "spam", "menor_de_edad", "otro"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Kinds of contact data the gentle anonymity notice mentions. */
export type ContactHint = "phone" | "email" | "handle";
