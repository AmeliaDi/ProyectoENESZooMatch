/**
 * Wire contract of `GET /api/profile` ("Tu carta"). Owner-only and derived:
 * never θ, SE, vectors, answers, filters or anything about other people
 * beyond the aliases already visible in the result.
 */
import type { SpriteMark } from "./result";

export type ReadingConfidenceDto = "clara" | "tentativa" | "abierta";
export type ReadingLeaningDto = "bajo" | "medio" | "alto";

export interface ScaleReadingDto {
  key: string;
  label: string;
  low: string;
  high: string;
  /** Estimated population position Φ(θ̂) ∈ [0, 1], 2 decimals. */
  position: number;
  /** One everyday line (HEXACO hexagon); optional. */
  hint?: string;
  /** Faint band Φ(θ̂ ± z·SE). */
  range: [number, number];
  confidence: ReadingConfidenceDto;
  leaning: ReadingLeaningDto;
}

export interface SectionReadingDto {
  id: string;
  title: string;
  blurb: string;
  scales: ScaleReadingDto[];
}

export interface AffinitySummaryDto {
  alias: string;
  animal: string;
  /** Rounded estimated affinity in %. */
  percent: number;
}

export interface ProfileDto {
  alias: string;
  animal: { id: string; name: string };
  color: { id: string; name: string; hex: string };
  mark: SpriteMark | null;
  narrative: string;
  mbti: { code: string; balancedAxes: number };
  enneagram: { code: string; name: string; archetype: string; exploring: boolean };
  virtues: Array<{ title: string; text: string }>;
  sections: SectionReadingDto[];
  /** How many scales are still at the population prior (unanswered modules). */
  openScales: { open: number; total: number };
  /** Optional modules already completed (ids only; never the answers). */
  completedModules: string[];
  affinities: {
    romance: { count: number; top: AffinitySummaryDto[] };
    amistad: { count: number; top: AffinitySummaryDto[] };
  };
}
