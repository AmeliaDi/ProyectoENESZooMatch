import { SCORING_CONFIG } from "@/lib/scoring/config";
import type { BigFive, ReasonCode } from "@/lib/scoring/types";

export interface ExplanationContext {
  closestTraits: Array<keyof BigFive>;
  sharedAxes: string[];
  complementaryAxes: string[];
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

  if (active.has("close_traits")) {
    const traits = context.closestTraits.map((trait) => TRAIT_LABELS[trait]);
    if (traits.length > 0) {
      sentences.push(`En sus respuestas, las mayores cercanías aparecen en ${traits.join(" y ")}.`);
    }
  }

  const observations: string[] = [];
  if (active.has("stability_bonus")) {
    observations.push("ambas personas muestran niveles bajos de neuroticismo, un patrón favorable para la estabilidad");
  }
  if (active.has("stability_penalty")) {
    observations.push("los niveles elevados de neuroticismo podrían hacer que algunas tensiones se sientan con más intensidad, sin que esto defina a ninguna persona");
  }
  if (active.has("high_conscientious_agreeable")) {
    observations.push("responsabilidad y amabilidad aparecen altas en ambas respuestas");
  }
  if (active.has("values_aligned")) {
    observations.push("las dimensiones socioculturales comparables muestran una alineación alta");
  }
  if (active.has("partial_data")) {
    observations.push("la estimación es parcial porque faltan algunos datos opcionales");
  }
  if (observations.length > 0) sentences.push(`${observations.join("; ")}.`);

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

  const limitedSentences = sentences.slice(0, SCORING_CONFIG.explanation.maxSentences);
  if (limitedSentences.length === 1 && active.has("close_traits")) {
    limitedSentences.push("Esta cercanía describe respuestas del cuestionario y no garantiza compatibilidad.");
  }

  return limitedSentences
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join(" ");
}
