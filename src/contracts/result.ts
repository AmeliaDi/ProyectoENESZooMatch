/**
 * Wire contracts for the public API. Shared by the server (which builds them)
 * and the client (which parses them). Nothing here may carry raw rows,
 * vectors, answers, matrícula hashes or counterpart user ids.
 */
import type { ChemistrySummary, MatchExplanation } from "@/domain/explainability";
import type { LayerAffinityBand } from "@/domain/explainability/layer-bands";

import type { IdentityDto } from "./identity";

export type {
  ChemistrySummary,
  HealthyTension,
  LayerContribution,
  MatchConfidence,
  MatchExplanation,
  TalkTopics,
} from "@/domain/explainability";

export type { AffinityBand, LayerAffinityBand, LineStrength } from "@/domain/explainability/layer-bands";

/** A shared scale as a band: pole leaning + how sure, never a position (ADR-030). */
export interface SharedScaleDto {
  key: string;
  label: string;
  low: string;
  high: string;
  leaning: "bajo" | "medio" | "alto";
  confidence: "clara" | "tentativa" | "abierta";
}

export interface SharedSectionDto {
  id: string;
  title: string;
  scales: SharedScaleDto[];
}

/** Only what the counterpart chose to share; empty by default. */
export interface SharedProfileDto {
  sections: SharedSectionDto[];
  mbti: { code: string } | null;
  /** Main type always; the wing only with the avatar-detail opt-in. */
  enneagram: { code: string; name: string } | null;
}

/** Enneagram subtype instinct drawn as a small sprite mark. */
export type SpriteMark = "sp" | "so" | "sx";

export interface QuizSubmittedDto {
  ok: true;
  recomputePending: boolean;
  profile: {
    /** Frozen identity of the owner; the reveal renders only this. */
    identity: IdentityDto;
    narrative: string;
    mbtiCode: string;
    enneagram: { code: string; nombre: string; arquetipo: string; exploring: boolean };
    /** Core progress in %, so the reveal can say what is still missing. */
    progressPercent: number;
    /** Exact number of core questions still unanswered (0 when hatched). */
    missingCount?: number;
  };
}

export interface MatchEntryDto {
  /** Opaque per-viewer handle (React key only); not reversible to a user id. */
  id: string | null;
  /** Counterpart identity, already filtered by what they chose to share. */
  identity: IdentityDto;
  similarity: number;
  /** Always present, even when the full explanation could not be built. */
  chemistry: ChemistrySummary;
  badges: Array<{ dimension: string; affinity: number }>;
  /** Layered explanation built from the exact pair score (ADR-021). */
  explanation: MatchExplanation | null;
  /** Affinity per layer as bands, from the same exact pair score (ADR-030). */
  layers: LayerAffinityBand[];
  shared: SharedProfileDto;
}

export interface ResultDto {
  /** Owner identity; every screen reads the name from here. */
  identity: IdentityDto;
  narrative: string;
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
