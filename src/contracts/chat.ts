/**
 * Wire contracts of the chat between matches (docs/CHAT.md §10). Shared by
 * the server (which builds them) and the client (which parses them). Never
 * carries user ids, matrícula hashes or the other person's unrevealed answers.
 */
import type { SpriteMark } from "./result";

export type ChatTrack = "romance" | "amistad";

/**
 * `rounds`: answering the question rounds (answers revealed per round only
 * when both answered). `invite`: rounds done, waiting until both accept the
 * free chat. `free`: free chat.
 */
export type ConversationStage = "rounds" | "invite" | "free";

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
  /** 1-based round in progress (only in the `rounds` stage). */
  round?: number;
  totalRounds: number;
  /** Something from the other person the viewer has not opened yet. */
  unread: boolean;
  /** The viewer can act now (answer the current round or accept free chat). */
  myTurn: boolean;
  updatedAt: string;
}

export interface InboxDto {
  conversations: InboxEntryDto[];
}

export interface RoundDto {
  /** 0-based; the `round` sent to POST .../answer. */
  index: number;
  question: string;
  /** The viewer's own answer, or `null` if not answered yet. */
  mine: string | null;
  /** The other answer: only once BOTH answered this round, otherwise `null`. */
  theirs: string | null;
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
  /** Rounds up to and including the current one (later questions stay hidden). */
  rounds: RoundDto[];
  totalRounds: number;
  /** `RoundDto.index` both still have to finish; `null` when all are done. */
  currentRound: number | null;
  /** Free-chat acceptance; `theirs` is only revealed once the viewer accepted. */
  freeReady: { mine: boolean; theirs: boolean };
  /** Free-chat messages, oldest first (empty before the `free` stage). */
  messages: ChatMessageDto[];
  limits: { answerChars: number; messageChars: number };
}

/** Interest in one match, keyed by `${track}:${matchId}` (matchId = MatchEntryDto.id). */
export type InterestStateDto = { state: "sent" } | { state: "open"; conversation: string };

export interface InterestStatesDto {
  states: Record<string, InterestStateDto>;
}

/** Body of POST/DELETE /api/interest. */
export interface InterestRequestDto {
  match: string;
  track: ChatTrack;
}
