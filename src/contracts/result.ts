/**
 * Wire contracts for the public API. Shared by the server (which builds them)
 * and the client (which parses them). Nothing here may carry raw rows,
 * vectors, answers, matrícula hashes or counterpart user ids.
 */
import type {
  ChemistrySummary,
  MatchExplanation,
} from "@/domain/explainability/explainability";

export type { AffinityBreakdown, ChemistrySummary, MatchExplanation } from "@/domain/explainability/explainability";

/** Enneagram subtype instinct drawn as a small sprite mark. */
export type SpriteMark = "sp" | "so" | "sx";

export interface QuizSubmittedDto {
  ok: true;
  recomputePending: boolean;
  profile: {
    alias: string;
    animal: string;
    color: string;
    /** Enneagram subtype mark on the sprite (own profile; `null` = none). */
    mark: SpriteMark | null;
    narrative: string;
    /** Display names for the reveal (own profile only). */
    animalName: string;
    colorName: string;
    mbtiCode: string;
    enneagram: { code: string; nombre: string; arquetipo: string };
  };
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
  /** Subtype mark, only when the counterpart opted in to show avatar detail. */
  mark: SpriteMark | null;
  mbti_code: string | null;
  similarity: number;
  /** Always present, even when the full explanation could not be built. */
  chemistry: ChemistrySummary;
  badges: Array<{ dimension: string; affinity: number }>;
  narrative: string;
  explanation: MatchExplanation | null;
}

export interface ResultDto {
  alias: string;
  animal: { id: string; diminutivo_es: string; categoria_fauna: string } | null;
  color: { id: string; nombre: string; hex: string } | null;
  mark: SpriteMark | null;
  narrative: string;
  mbti_code: string | null;
  matches: { romance: MatchEntryDto[]; amistad: MatchEntryDto[] };
  /** Coarse flag (never the count) so the empty state can say "somos pocxs". */
  few_people: boolean;
  no_match_message: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null | undefined;
  read: boolean;
  created_at: string;
}
