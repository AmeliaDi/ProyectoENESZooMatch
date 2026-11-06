/**
 * Formal psychometric layer: Big Five → cognitive functions (Jung/MBTI),
 * Enneagram type + wing and relational attachment style.
 *
 * The Enneagram profile is a DERIVED archetype, not a clinical assessment.
 * It is computed deterministically from the same 30 normalized dimensions that
 * feed the questionnaire, so the demo never asks for extra sensitive data.
 */

import { ENNEAGRAM_ASSIGNMENTS, ENNEAGRAM_DATA } from "@/config";
import type { ArchetypeAnimal } from "@/types/archetype";
import type { Dimension } from "@/types/microtest";

export type EnneagramType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type EnneagramTriad = "emocional" | "mental" | "instintiva";
export type AttachmentStyle = "seguro" | "ansioso" | "evitativo";
export type CognitiveFunction = "Ne" | "Ni" | "Se" | "Si" | "Fe" | "Fi" | "Te" | "Ti";

export interface EnneagramTypeMeta {
  nombre: string;
  miedo_basico: string;
  deseo_nuclear: string;
  triada: EnneagramTriad;
}

export interface EnneagramWingMeta {
  nombre: string;
  triada: EnneagramTriad;
}

export interface EnneagramProfile {
  type: EnneagramType;
  wing: EnneagramType;
  code: string;
  nombre: string;
  arquetipo: string;
  triada: EnneagramTriad;
  miedo: string;
  deseo: string;
}

export interface CognitiveProfile {
  dominant: CognitiveFunction;
  auxiliary: CognitiveFunction;
  axis: string;
}

export interface AttachmentProfile {
  style: AttachmentStyle;
  label: string;
  scores: {
    secure: number;
    anxious: number;
    avoidant: number;
  };
}

export interface PsychometricProfile {
  mbtiCode: string;
  cognitive: CognitiveProfile;
  enneagram: EnneagramProfile;
  attachment: AttachmentProfile;
}

interface EnneagramData {
  readonly types: Readonly<Record<string, EnneagramTypeMeta>>;
  readonly wings: Readonly<Record<string, EnneagramWingMeta>>;
  readonly prototypes: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly integration: Readonly<Record<string, number>>;
  readonly stress: Readonly<Record<string, number>>;
}

const DATA: EnneagramData = ENNEAGRAM_DATA;
const CURATED_ASSIGNMENTS = ENNEAGRAM_ASSIGNMENTS;
const ATTACHMENT_LABEL = ENNEAGRAM_DATA.attachment_label;

const TYPE_NUMBERS: readonly EnneagramType[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Dimensions that define the nine motivational prototypes. */
const PROTOTYPE_DIMENSIONS: readonly Dimension[] = [
  "personalidad_apertura",
  "personalidad_responsabilidad",
  "personalidad_extraversion",
  "personalidad_amabilidad",
  "personalidad_estabilidad_emocional",
  "valores_empatia",
  "valores_gestion_conflicto",
  "valores_confianza",
  "identidad_comunicacion_afectiva",
  "cultural_estetica_visual",
  "cultural_humor",
  "intimidad_limites_respeto",
  "intimidad_comunicacion_deseos",
];

const FUNCTION_LABELS: Record<CognitiveFunction, string> = {
  Ne: "Intuición extrovertida",
  Ni: "Intuición introvertida",
  Se: "Sensación extrovertida",
  Si: "Sensación introvertida",
  Fe: "Sentimiento extrovertido",
  Fi: "Sentimiento introvertido",
  Te: "Pensamiento extrovertido",
  Ti: "Pensamiento introvertido",
};

/**
 * Dominant and auxiliary functions for each MBTI code. The order follows the
 * canonical Jungian stack: perceiving or judging first according to the
 * extraversion letter, then the complementary attitude.
 */
const COGNITIVE_BY_MBTI: Record<string, readonly [CognitiveFunction, CognitiveFunction]> = {
  INFP: ["Fi", "Ne"],
  ENFP: ["Ne", "Fi"],
  INFJ: ["Ni", "Fe"],
  ENFJ: ["Fe", "Ni"],
  INTJ: ["Ni", "Te"],
  ENTJ: ["Te", "Ni"],
  INTP: ["Ti", "Ne"],
  ENTP: ["Ne", "Ti"],
  ISFP: ["Fi", "Se"],
  ESFP: ["Se", "Fi"],
  ISTP: ["Ti", "Se"],
  ESTP: ["Se", "Ti"],
  ISFJ: ["Si", "Fe"],
  ESFJ: ["Fe", "Si"],
  ISTJ: ["Si", "Te"],
  ESTJ: ["Te", "Si"],
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function score(
  scores: Partial<Record<Dimension, number>> | Record<string, number> | null | undefined,
  dimension: Dimension,
): number {
  const value = scores?.[dimension];
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : 0.5;
}

function mean(...values: number[]): number {
  if (values.length === 0) return 0.5;
  return clamp01(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeMbti(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase() ?? "";
  return COGNITIVE_BY_MBTI[normalized] ? normalized : "INFP";
}

function wingOf(type: EnneagramType, choice: "previous" | "next"): EnneagramType {
  if (choice === "previous") return (type === 1 ? 9 : type - 1) as EnneagramType;
  return (type === 9 ? 1 : type + 1) as EnneagramType;
}

export function cognitiveProfileFor(mbtiCode: string | null | undefined): CognitiveProfile {
  const code = normalizeMbti(mbtiCode);
  const [dominant, auxiliary] = COGNITIVE_BY_MBTI[code]!;
  return {
    dominant,
    auxiliary,
    axis: `${dominant}-${auxiliary}`,
  };
}

export function cognitiveFunctionLabel(fn: CognitiveFunction): string {
  return FUNCTION_LABELS[fn];
}

/**
 * Nine prototype centroids from `data/enneagram.json`. Each profile is
 * classified by the nearest prototype after centering both vectors at 0.5, so
 * a uniformly high or low answer style cannot bias the type.
 */
function enneagramDistances(
  scores: Partial<Record<Dimension, number>> | Record<string, number> | null | undefined,
): Record<EnneagramType, number> {
  const distances = {} as Record<EnneagramType, number>;
  for (const type of TYPE_NUMBERS) {
    const prototype = DATA.prototypes[String(type)] ?? {};
    let squaredDistance = 0;
    for (const dimension of PROTOTYPE_DIMENSIONS) {
      const profileValue = score(scores, dimension) - 0.5;
      const prototypeValue = (prototype[dimension] ?? 0.5) - 0.5;
      squaredDistance += (profileValue - prototypeValue) ** 2;
    }
    distances[type] = squaredDistance;
  }
  return distances;
}

/**
 * Nombre del tipo considerado solo (`"4"`). `enneagramProfileFromType` exige un
 * ala vecina real, así que una lectura sin ala no puede pedirle un `4w4`.
 */
export function enneagramTypeName(type: EnneagramType): string {
  return DATA.types[String(type)]!.nombre;
}

export function enneagramProfileFromType(
  type: EnneagramType,
  wing: EnneagramType,
): EnneagramProfile {  const code = `${type}w${wing}`;
  const typeMeta = DATA.types[String(type)]!;
  const wingMeta = DATA.wings[code]!;
  return {
    type,
    wing,
    code,
    nombre: typeMeta.nombre,
    arquetipo: wingMeta.nombre,
    triada: wingMeta.triada,
    miedo: typeMeta.miedo_basico,
    deseo: typeMeta.deseo_nuclear,
  };
}

/**
 * Parses a curated `4w5`-style code and rejects non-adjacent wings.
 */
function parseWingCode(code: string): { type: EnneagramType; wing: EnneagramType } | null {
  const match = /^([1-9])w([1-9])$/.exec(code.trim());
  if (!match) return null;
  const type = Number(match[1]) as EnneagramType;
  const wing = Number(match[2]) as EnneagramType;
  const previous = wingOf(type, "previous");
  const next = wingOf(type, "next");
  return wing === previous || wing === next ? { type, wing } : null;
}

export function enneagramProfileFor(
  scores: Partial<Record<Dimension, number>> | Record<string, number> | null | undefined,
): EnneagramProfile {
  const distances = enneagramDistances(scores);
  let type: EnneagramType = 1;
  for (const candidate of TYPE_NUMBERS) {
    if (distances[candidate] < distances[type]) type = candidate;
  }

  const previous = wingOf(type, "previous");
  const next = wingOf(type, "next");
  const wing = distances[next] <= distances[previous] ? next : previous;
  return enneagramProfileFromType(type, wing);
}

/** Only flavours the secure label; it never changes the style itself. */
function secureFlavor(extraversion: number): string {
  if (extraversion < ATTACHMENT_LABEL.introspective_below) return " introspectivo";
  if (extraversion > ATTACHMENT_LABEL.expansive_above) return " expansivo";
  return "";
}

export function attachmentProfileFor(
  scores: Partial<Record<Dimension, number>> | Record<string, number> | null | undefined,
): AttachmentProfile {
  const E = score(scores, "personalidad_extraversion");
  const A = score(scores, "personalidad_amabilidad");
  const S = score(scores, "personalidad_estabilidad_emocional");
  const empathy = score(scores, "valores_empatia");
  const emotionalOpenness = score(scores, "intimidad_apertura_emocional");
  const limits = score(scores, "intimidad_limites_respeto");
  const desires = score(scores, "intimidad_comunicacion_deseos");

  const secure = mean(emotionalOpenness, limits, S);
  const anxious = mean(desires, empathy, 1 - limits, 1 - S);
  const avoidant = mean(1 - emotionalOpenness, limits, 1 - A, 1 - desires);

  let style: AttachmentStyle = "seguro";
  if (anxious > secure && anxious >= avoidant) style = "ansioso";
  else if (avoidant > secure && avoidant > anxious) style = "evitativo";

  const flavor = style === "seguro" ? secureFlavor(E) : "";
  return {
    style,
    label: `${style.charAt(0).toUpperCase()}${style.slice(1)}${flavor}`,
    scores: { secure, anxious, avoidant },
  };
}

export function derivePsychometricProfile(
  scores: Partial<Record<Dimension, number>> | Record<string, number> | null | undefined,
  mbtiCode: string | null | undefined,
): PsychometricProfile {
  const code = normalizeMbti(mbtiCode);
  return {
    mbtiCode: code,
    cognitive: cognitiveProfileFor(code),
    enneagram: enneagramProfileFor(scores),
    attachment: attachmentProfileFor(scores),
  };
}

export type AnimalPsychometricSource = Pick<
  ArchetypeAnimal,
  "id" | "vector_big_five" | "mbti_primario" | "personality_affinity"
>;

/**
 * Projects an animal's OCEAN vector and MBTI code onto the 30 relational
 * dimensions used by the questionnaire. Exposed so development surfaces can
 * reuse the exact same derivation as the psychometric profile.
 */
export function projectAnimalDimensions(animal: AnimalPsychometricSource): {
  mbti: string;
  scores: Partial<Record<Dimension, number>>;
} {
  const [O, C, E, A, S] = animal.vector_big_five;
  const mbti = normalizeMbti(animal.mbti_primario);
  const scores: Partial<Record<Dimension, number>> = {
    personalidad_apertura: O,
    personalidad_responsabilidad: C,
    personalidad_extraversion: E,
    personalidad_amabilidad: A,
    personalidad_estabilidad_emocional: S,
    mbti_extraversion: mbti[0] === "E" ? 1 : 0,
    mbti_intuicion: mbti[1] === "N" ? 1 : 0,
    mbti_pensamiento: mbti[2] === "T" ? 1 : 0,
    mbti_juicio: mbti[3] === "J" ? 1 : 0,
    identidad_exclusividad: mean(C, S),
    identidad_comunicacion_afectiva: mean(A, O),
    cultural_musica_exploracion: O,
    cultural_estetica_visual: O,
    cultural_hobbies_creativos: mean(O, E, A),
    cultural_vida_universitaria: mean(E, O),
    cultural_humor: mean(E, A),
    intimidad_palabras_afirmacion: mean(E, A),
    intimidad_tiempo_calidad: mean(A, C),
    intimidad_regalos_detalle: mean(A, O),
    intimidad_contacto_fisico: mean(E, A),
    intimidad_actos_servicio: mean(C, A),
    intimidad_apertura_emocional: mean(A, S),
    intimidad_comunicacion_deseos: mean(E, A, O),
    intimidad_limites_respeto: mean(S, C),
    valores_empatia: A,
    valores_confianza: mean(A, S),
    valores_gestion_conflicto: mean(S, A, C),
    valores_igualdad_genero: mean(O, A),
    valores_corresponsabilidad: mean(C, A),
    valores_respeto_diversidad: mean(O, A),
  };

  return { mbti, scores };
}

/**
 * Derives the same psychometric profile for a catalogue animal. Missing
 * relational dimensions are projected from its OCEAN vector and MBTI code so
 * every animal has a coherent, reproducible archetype.
 */
export function deriveAnimalPsychometricProfile(
  animal: AnimalPsychometricSource,
): PsychometricProfile {
  const { mbti, scores } = projectAnimalDimensions(animal);
  const curated = parseWingCode(CURATED_ASSIGNMENTS[animal.id] ?? "");
  return {
    mbtiCode: mbti,
    cognitive: cognitiveProfileFor(mbti),
    enneagram: curated
      ? enneagramProfileFromType(curated.type, curated.wing)
      : enneagramProfileFor(scores),
    attachment: attachmentProfileFor(scores),
  };
}

/** Curated overrides that guarantee all 18 wings are represented. */
export const ENNEAGRAM_CURATED_ASSIGNMENTS: Readonly<Record<string, string>> =
  CURATED_ASSIGNMENTS;

/** Wing codes covered by the canonical Enneagram data, in display order. */
export const ENNEAGRAM_WING_CODES: readonly string[] = Object.keys(DATA.wings);

