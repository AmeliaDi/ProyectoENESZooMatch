/**
 * Response contracts. These are the only shapes that leave the server: no
 * raw rows, vectors, answers, matrícula hashes or counterpart user ids.
 */
import type { MatchExplanation } from "@/domain/explainability/explainability";

import type { NotificationRecord, OwnProfile } from "./ports";

export interface QuizSubmittedDto {
  ok: true;
  recomputePending: boolean;
  profile: { alias: string; animal: string; color: string; narrative: string };
}

export interface MatchEntryDto {
  /** Opaque per-viewer handle (React key only); not reversible to a user id. */
  id: string | null;
  alias: string;
  animal: string;
  animal_id: string | null;
  color: string;
  color_id: string | null;
  color_hex: string | null;
  mbti_code: string | null;
  similarity: number;
  badges: Array<{ dimension: string; affinity: number }>;
  narrative: string;
  explanation: MatchExplanation | null;
}

export interface ResultDto {
  alias: string;
  animal: OwnProfile["animal"];
  color: OwnProfile["color"];
  narrative: string;
  mbti_code: string | null;
  matches: { romance: MatchEntryDto[]; amistad: MatchEntryDto[] };
  no_match_message: string;
}

export type NotificationDto = NotificationRecord;
