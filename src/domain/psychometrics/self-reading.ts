/**
 * "Tu carta": owner-only, kind readings of the latent profile (ADR-019).
 *
 * For a factor with posterior N(θ̂, SE²) under a N(0, 1) population prior:
 *  - position  p = Φ(θ̂)                 (estimated population percentile)
 *  - range     [Φ(θ̂ − z·SE), Φ(θ̂ + z·SE)] (drawn as a faint band)
 *  - reliability ρ = 1 − SE²             (share of prior variance removed)
 *  - confidence: clara ρ ≥ ρ_clear, tentativa ρ ≥ ρ_tentative, else abierta
 *    (abierta = the module was not answered; the prior is shown, not a trait).
 * A virtue is the configured pole of a scale when its leaning is clear of the
 * middle band and |θ̂| > margin·SE; ranked by |θ̂|/SE. Nothing raw (θ, SE,
 * answers) leaves this module: only rounded, derived readings.
 */
import { SELF_READING, type SelfReadingConfig } from "@/config/self-reading";
import { normalCdf } from "@/domain/math";
import type { LatentProfile } from "@/types/latent";

export type ReadingConfidence = "clara" | "tentativa" | "abierta";
export type ReadingLeaning = "bajo" | "medio" | "alto";
export type ReadingSectionId = SelfReadingConfig["sections"][number]["id"];

export interface ScaleReading {
  readonly key: string;
  readonly label: string;
  readonly low: string;
  readonly high: string;
  /** Φ(θ̂) rounded to 2 decimals. */
  readonly position: number;
  readonly range: readonly [number, number];
  readonly confidence: ReadingConfidence;
  readonly leaning: ReadingLeaning;
}

export interface SectionReading {
  readonly id: ReadingSectionId;
  readonly title: string;
  readonly blurb: string;
  readonly scales: readonly ScaleReading[];
}

export interface VirtueReading {
  readonly title: string;
  readonly text: string;
  readonly section: ReadingSectionId;
}

const PERCENT = 100;
const round2 = (x: number) => Math.round(x * PERCENT) / PERCENT;
const finite = (x: number | undefined, fallback: number) => (x !== undefined && Number.isFinite(x) ? x : fallback);

/** Prior SD of every factor; an unanswered module keeps SE = 1. */
const PRIOR_SE = 1;
/** A posterior SD is never negative nor wider than the prior. */
const clampSe = (se: number) => Math.min(PRIOR_SE, Math.max(0, se));

export function readingConfidence(se: number, config: SelfReadingConfig = SELF_READING): ReadingConfidence {
  const reliability = 1 - clampSe(se) ** 2;
  const { clearReliability, tentativeReliability } = config.uncertainty;
  if (reliability >= clearReliability) return "clara";
  return reliability >= tentativeReliability ? "tentativa" : "abierta";
}

function factorPosterior(profile: LatentProfile, factor: string) {
  return { theta: finite(profile.theta[factor], 0), se: clampSe(finite(profile.se[factor], PRIOR_SE)) };
}

export function readScale(
  profile: LatentProfile,
  scale: SelfReadingConfig["sections"][number]["scales"][number],
  config: SelfReadingConfig = SELF_READING,
): ScaleReading {
  const { theta, se } = factorPosterior(profile, scale.factor);
  const { intervalZ, lowBand, highBand } = config.uncertainty;
  const confidence = readingConfidence(se, config);
  const position = normalCdf(theta);
  const leaning: ReadingLeaning =
    confidence === "abierta" || (position >= lowBand && position <= highBand) ? "medio" : position < lowBand ? "bajo" : "alto";
  return {
    key: scale.factor,
    label: scale.label,
    low: scale.low,
    high: scale.high,
    position: round2(position),
    range: [round2(normalCdf(theta - intervalZ * se)), round2(normalCdf(theta + intervalZ * se))],
    confidence,
    leaning,
  };
}

export function readSections(profile: LatentProfile, config: SelfReadingConfig = SELF_READING): SectionReading[] {
  return config.sections.map((section) => ({
    id: section.id,
    title: section.title,
    blurb: section.blurb,
    scales: section.scales.map((scale) => readScale(profile, scale, config)),
  }));
}

export function readVirtues(profile: LatentProfile, config: SelfReadingConfig = SELF_READING): VirtueReading[] {
  const candidates: Array<VirtueReading & { strength: number; order: number }> = [];
  let order = 0;
  for (const section of config.sections) {
    for (const scale of section.scales) {
      order += 1;
      const reading = readScale(profile, scale, config);
      if (reading.leaning === "medio") continue;
      const virtue = reading.leaning === "alto" ? scale.virtues?.high : scale.virtues?.low;
      const { theta, se } = factorPosterior(profile, scale.factor);
      if (!virtue || Math.abs(theta) <= config.uncertainty.virtueMargin * se) continue;
      candidates.push({ ...virtue, section: section.id, strength: Math.abs(theta) / Math.max(se, Number.EPSILON), order });
    }
  }
  return candidates
    .sort((a, b) => b.strength - a.strength || a.order - b.order)
    .slice(0, config.virtuesMax)
    .map(({ title, text, section }) => ({ title, text, section }));
}

/** Scales still at the prior: how much "afinar tu perfil" would add. */
export function openScaleCount(sections: readonly SectionReading[]): { open: number; total: number } {
  const all = sections.flatMap((s) => s.scales);
  return { open: all.filter((s) => s.confidence === "abierta").length, total: all.length };
}
