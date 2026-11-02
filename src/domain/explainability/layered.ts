/**
 * Layered explanation of a pair score (ADR-021). Every number shown comes from
 * `aggregatePair`, whose contributions sum EXACTLY to the total:
 *
 *   points_c = 100 · contribution_c        Σ_c points_c = 100 · total
 *
 * - "Lo que más conecta": core/tail categories of layers 1–3 ranked by their
 *   real contribution (HEXACO, values, plans, relational style, lifestyle).
 * - "Lo que podrían platicar": MBTI/Enneagram (layer 4), presented as
 *   narrative with their true (tiny) weight, never as a cause.
 * - Tension: the weakest CORE category (argmin similarity).
 * - Confidence: margin over the threshold, core floor and posterior
 *   uncertainty of the pair; qualitative only, never a probability.
 */
import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { EXPLANATION_COPY, categoryCopy } from "@/config/explanation-copy";
import { kernelFactorLogs } from "@/domain/matching/layers";
import type { PairScore } from "@/domain/matching/pair-score";
import type { LatentProfile } from "@/types/latent";
import type { MatchCategoryId } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { computeChemistrySummary, type ChemistrySummary } from "./chemistry";
import { buildMbtiCompatibility } from "./mbti-dynamics";

const PERCENT = 100;
const IDENTITY = new Set<MatchCategoryId>(MATCHING_CONFIG.tail_groups.identity);

export interface LayerContribution {
  category: MatchCategoryId;
  label: string;
  icon: string;
  /** Category similarity in % (0–100). */
  percentage: number;
  /** Real share of the affinity in points; all points sum to the affinity %. */
  points: number;
  phrase: string;
}

export interface MatchConfidence {
  level: "alta" | "media";
  label: string;
  reason: string;
}

export interface HealthyTension {
  category: MatchCategoryId;
  categoryLabel: string;
  percentage: number;
  /** `true` when even the weakest core area stays above the confidence floor. */
  complementary: boolean;
  title: string;
  text: string;
}

export interface TalkTopics {
  /** Real points MBTI + Enneagram add to the affinity (tiny by design). */
  points: number;
  intro: string;
  lines: string[];
}

export interface MatchExplanation {
  chemistry: ChemistrySummary;
  headline: string;
  /** "Lo que más conecta" (layers 1–3), ranked by real contribution. */
  connects: LayerContribution[];
  /** Points of layer 1–3 areas not listed in `connects` (connects + others + talk = affinity). */
  otherPoints: number;
  /** One HEXACO line when personality connects the most; null otherwise. */
  personalityNote: string | null;
  talk: TalkTopics;
  tension: HealthyTension | null;
  confidence: MatchConfidence;
}

/** Owner-safe narrative inputs (labels only, never θ or answers). */
export interface NarrativeSide {
  /** Main enneagram type (1–9) or null when the readout is ambiguous. */
  enneagramType: number | null;
  mbti: string | null;
}

const toPoints = (x: number) => Math.round(x * PERCENT * 10) / 10;

function phraseFor(id: MatchCategoryId, similarity: number): string {
  const { bands } = EXPLANATION_COPY;
  const band = similarity >= bands.alta ? "alta" : similarity >= bands.media ? "media" : "baja";
  return categoryCopy(id).phrases[band];
}

function contribution(c: PairScore["categories"][number]): LayerContribution {
  const copy = categoryCopy(c.id);
  return {
    category: c.id,
    label: copy.label,
    icon: copy.icon,
    percentage: Math.round(c.similarity * PERCENT),
    points: toPoints(c.contribution),
    phrase: phraseFor(c.id, c.similarity),
  };
}

/**
 * HEXACO factor that adds the most to `personalidad` (largest log-term).
 * A factor with low-side asymmetry (Honestidad-Humildad) is only named when
 * both posteriors sit at or above the mean, so the values wording is true.
 */
function personalityNote(a: LatentProfile, b: LatentProfile): string | null {
  const cfg = MATCHING_CONFIG.categories.personalidad;
  if (cfg.kind !== "kernel") return null;
  const nameable = ([factor]: [string, number]) =>
    !cfg.low_side?.[factor] || Math.min(a.theta[factor] ?? 0, b.theta[factor] ?? 0) >= 0;
  const [best] = kernelFactorLogs(cfg, a, b)
    .filter(nameable)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  return best ? (EXPLANATION_COPY.personality_factors[best[0]] ?? null) : null;
}

/** Mean posterior variance of the pair over the track's core factors. */
export function pairUncertainty(a: LatentProfile, b: LatentProfile, track: MatchTrack): number {
  const core = Object.keys(MATCHING_CONFIG.tracks[track].core) as MatchCategoryId[];
  const factors = core.flatMap((id) => Object.keys(MATCHING_CONFIG.categories[id].factors));
  if (factors.length === 0) return 0;
  const sum = factors.reduce((s, f) => s + ((a.se[f] ?? 1) ** 2 + (b.se[f] ?? 1) ** 2) / 2, 0);
  return sum / factors.length;
}

export function computeMatchConfidence(
  chemistry: ChemistrySummary,
  score: PairScore,
  uncertainty: number,
): MatchConfidence {
  const cfg = MATCHING_CONFIG.explainability;
  const copy = EXPLANATION_COPY.confidence;
  const weakest = weakestCore(score);
  if (chemistry.relativePosition < cfg.confidence_high_margin) return { level: "media", ...copy.margin };
  if (weakest && weakest.similarity * PERCENT < cfg.category_floor) {
    return { level: "media", label: copy.floor.label, reason: copy.floor.reason.replace("{area}", categoryCopy(weakest.id).label.toLowerCase()) };
  }
  if (uncertainty > cfg.confidence_max_uncertainty) return { level: "media", ...copy.uncertainty };
  return { level: "alta", ...copy.alta };
}

function weakestCore(score: PairScore) {
  const core = score.categories.filter((c) => c.role === "core");
  return core.reduce<(typeof core)[number] | null>((low, c) => (!low || c.similarity < low.similarity ? c : low), null);
}

export function findHealthyTension(score: PairScore): HealthyTension | null {
  const low = weakestCore(score);
  if (!low) return null;
  const { tension } = EXPLANATION_COPY;
  const complementary = low.similarity * PERCENT >= MATCHING_CONFIG.explainability.category_floor;
  return {
    category: low.id,
    categoryLabel: categoryCopy(low.id).label,
    percentage: Math.round(low.similarity * PERCENT),
    complementary,
    title: complementary ? tension.sana : tension.platicar,
    text: tension.texts[low.id] ?? phraseFor(low.id, low.similarity),
  };
}

function talkTopics(score: PairScore, self: NarrativeSide, other: NarrativeSide): TalkTopics {
  const identity = score.categories.filter((c) => IDENTITY.has(c.id));
  const points = toPoints(identity.reduce((s, c) => s + c.contribution, 0));
  const { talk } = EXPLANATION_COPY;
  const lines = identity.map((c) => phraseFor(c.id, c.similarity));
  const dynamics = buildMbtiCompatibility(self.mbti, other.mbti);
  if (dynamics) lines.push(dynamics.dinamicaNatural);
  lines.push(enneagramLine(self.enneagramType, other.enneagramType));
  return { points, intro: talk.intro.replace("{points}", String(points)).replace("{total}", String(PERCENT)), lines };
}

function enneagramLine(self: number | null, other: number | null): string {
  const { talk } = EXPLANATION_COPY;
  const a = self === null ? undefined : talk.motives[String(self)];
  const b = other === null ? undefined : talk.motives[String(other)];
  if (!a || !b) return talk.enneagram_open;
  return self === other ? talk.enneagram_same.replace("{self}", a) : talk.enneagram.replace("{self}", a).replace("{other}", b);
}

export interface ExplainPairInput {
  score: PairScore;
  track: MatchTrack;
  self: LatentProfile;
  other: LatentProfile;
  selfNarrative: NarrativeSide;
  otherNarrative: NarrativeSide;
}

export function explainPair(input: ExplainPairInput): MatchExplanation {
  const { score, track, self, other } = input;
  const chemistry = computeChemistrySummary(score.total, track);
  const ranked = score.categories
    .filter((c) => !IDENTITY.has(c.id))
    .sort((x, y) => y.contribution - x.contribution || (x.id < y.id ? -1 : 1));
  const shown = ranked.filter((c) => c.contribution > 0).slice(0, EXPERIENCE.result.detailBreakdownMax);
  const rest = ranked.filter((c) => !shown.includes(c)).reduce((s, c) => s + c.contribution, 0);
  const connects = shown.map(contribution);
  const top = connects[0];
  return {
    chemistry,
    headline: top ? EXPLANATION_COPY.headlines[track].replace("{area}", top.label.toLowerCase()) : "",
    connects,
    otherPoints: toPoints(rest),
    personalityNote: top?.category === "personalidad" ? personalityNote(self, other) : null,
    talk: talkTopics(score, input.selfNarrative, input.otherNarrative),
    tension: findHealthyTension(score),
    confidence: computeMatchConfidence(chemistry, score, pairUncertainty(self, other, track)),
  };
}
