import {
  buildMatchNarrative,
  type MatchNarrative,
} from "@/lib/matching/explainability";
import { SCORING_CONFIG } from "@/lib/scoring/config";
import type { BigFive, ReasonCode, ScoringProfile } from "@/lib/scoring/types";
import type { MatchTrack } from "@/types/microtest";

export interface ExplanationContext {
  closestTraits: Array<keyof BigFive>;
  sharedAxes: string[];
  complementaryAxes: string[];
}

/**
 * Adapter input for the track-aware psychological narrative. Similarity is the
 * canonical 0-1 track score; Big Five values in `ScoringProfile` are 0-100 and
 * are normalized here before they reach the shared narrative engine.
 */
export interface NarrativeExplanationContext {
  track: MatchTrack;
  similarity: number;
  user: ScoringProfile;
  match: ScoringProfile;
  userAnimal: string;
  matchAnimal: string;
}

function toDimensionScores(profile: ScoringProfile): Record<string, number> | null {
  if (!profile.bigFive) return null;
  const { O, C, E, A, N } = profile.bigFive;
  return {
    personalidad_apertura: O / 100,
    personalidad_responsabilidad: C / 100,
    personalidad_extraversion: E / 100,
    personalidad_amabilidad: A / 100,
    personalidad_estabilidad_emocional: (100 - N) / 100,
  };
}

/**
 * Produces the same `tituloQuimica` / `porQueFunciona` / `dinamicaCotidiana` /
 * `puntoDeAtencion` object used by the constellation detail sheet, from the
 * legacy scoring profile shape.
 */
export function explainPairNarrative(
  context: NarrativeExplanationContext,
): MatchNarrative {
  return buildMatchNarrative({
    track: context.track,
    similarity: context.similarity,
    userDimensionScores: toDimensionScores(context.user),
    matchDimensionScores: toDimensionScores(context.match),
    userMbtiCode: context.user.mbti,
    matchMbtiCode: context.match.mbti,
    userAnimal: context.userAnimal,
    matchAnimal: context.matchAnimal,
  });
}

const TRAIT_LABELS: Record<keyof BigFive, string> = {
  O: "apertura",
  C: "responsabilidad",
  E: "extraversión",
  A: "amabilidad",
  N: "estabilidad emocional",
};

export function explainPair(reasons: ReasonCode[], context: ExplanationContext): string {
  const active = new Set(reasons);
  const sentences: string[] = [];

  if (active.has("stability_bonus")) {
    sentences.push(
      "Ambas personas muestran niveles bajos de neuroticismo, un patrón favorable para la estabilidad.",
    );
  } else if (active.has("stability_penalty")) {
    sentences.push(
      "Los niveles elevados de neuroticismo podrían hacer que algunas tensiones se sientan con más intensidad, sin que esto defina a ninguna persona.",
    );
  }

  if (active.has("close_traits")) {
    const traits = context.closestTraits.map((trait) => TRAIT_LABELS[trait]);
    if (traits.length > 0) {
      sentences.push(`En sus respuestas, las mayores cercanías aparecen en ${traits.join(" y ")}.`);
    }
  }

  const conflictAligned = active.has("conflict_style_aligned");
  const empathyAligned = active.has("empathy_aligned");
  if (conflictAligned && empathyAligned) {
    sentences.push("En sus respuestas sobre resolución de conflictos y empatía, sus preferencias muestran cercanía.");
  } else if (conflictAligned) {
    sentences.push("En sus respuestas sobre resolución de conflictos, sus preferencias son compatibles.");
  } else if (empathyAligned) {
    sentences.push("En sus respuestas sobre empatía, sus valores muestran cercanía.");
  }
  if (active.has("high_conscientious_agreeable")) {
    sentences.push("Responsabilidad y amabilidad aparecen altas en ambas respuestas.");
  }
  if (active.has("values_aligned")) {
    sentences.push("Las dimensiones socioculturales comparables muestran una alineación alta.");
  }

  if (active.has("mbti_shared") || active.has("mbti_complementary")) {
    const clauses: string[] = [];
    if (active.has("mbti_shared") && context.sharedAxes.length > 0) {
      clauses.push(`coinciden en los ejes ${context.sharedAxes.join(" y ")}`);
    }
    if (active.has("mbti_complementary") && context.complementaryAxes.length > 0) {
      clauses.push(`sus preferencias distintas en ${context.complementaryAxes.join(" y ")} pueden aportar perspectivas diferentes`);
    }
    if (clauses.length > 0) {
      sentences.push(`Como referencia heurística MBTI, ${clauses.join("; ")}.`);
    }
  }

  if (active.has("partial_data")) {
    sentences.push("La estimación es parcial porque faltan algunos datos opcionales.");
  }

  const partialSentence = active.has("partial_data") ? sentences.pop() : undefined;
  const otherSentenceLimit =
    SCORING_CONFIG.explanation.maxSentences - (partialSentence ? 1 : 0);
  const limitedSentences = sentences.slice(0, otherSentenceLimit);
  if (limitedSentences.length === 1 && active.has("close_traits")) {
    limitedSentences.push("Esta cercanía describe respuestas del cuestionario y no garantiza compatibilidad.");
  }
  if (partialSentence) limitedSentences.push(partialSentence);

  return limitedSentences
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join(" ");
}
