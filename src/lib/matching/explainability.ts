/**
 * ZooMatch — Explainability Engine
 *
 * Translates raw cosine-similarity results into warm, human, affective Spanish
 * (es-MX) language. Every function here is deterministic and side-effect free:
 * identical inputs always produce identical outputs (no randomness, no clocks).
 *
 * The engine consumes the same ordered dimension vectors used by the matching
 * core (`ROMANCE_VECTOR_DIMENSIONS` / `FRIENDSHIP_VECTOR_DIMENSIONS`) and turns
 * them into:
 *   - a chemistry summary (percentage + qualitative level),
 *   - a per-category affinity breakdown with dynamic affective phrases,
 *   - a concise (max 3-line) personality summary for the match,
 *   - a one-line poetic headline describing the connection.
 *
 * All user-facing copy uses inclusive language (-x endings), stays under 200
 * characters per phrase, and is never clinical.
 */

import type { MatchTrack } from "@/types/microtest";
import {
  BIG_FIVE_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
} from "@/types/microtest";
import { getMatchingConfig } from "./config";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Qualitative chemistry bands, from highest to lowest affinity. */
export type ChemistryLevel =
  | "almas_gemelas" //       relative position >= 0.70
  | "quimica_excepcional" // >= 0.45
  | "quimica_fuerte" //      >= 0.25
  | "buena_quimica" //       >= 0.10
  | "quimica_moderada"; //    everything else (at or below the track threshold)

export interface ChemistrySummary {
  /** Integer percentage, 0-100. */
  percentage: number;
  /** Formatted headline, e.g. "92% de Compatibilidad". */
  displayText: string;
  /** Machine-readable qualitative band. */
  level: ChemistryLevel;
  /** Human-readable Spanish label for the band. */
  levelLabel: string;
  /** Track similarity threshold used to normalize the band (0-1). */
  threshold: number;
  /** Position within [threshold, 1]; 0 means at/below the threshold. */
  relativePosition: number;
}

/** The five affinity categories surfaced in the breakdown. */
export type AffinityCategory =
  | "personalidad"
  | "afinidad_cultural"
  | "intimidad_afecto"
  | "valores_relacionales"
  | "identidad";

export interface AffinityBreakdown {
  /** Machine-readable category key. */
  category: string;
  /** Spanish display label, e.g. "Personalidad". */
  categoryLabel: string;
  /** Integer affinity percentage, 0-100. */
  percentage: number;
  /** Dynamic affective phrase chosen from the category's range template. */
  phrase: string;
  /** Category icon (emoji). */
  icon: string;
}

export interface PersonalitySummary {
  /** Warm, concise summary (max 3 lines). */
  text: string;
  /** e.g. "personalidad mediadora (INFP)". */
  mbtiLabel: string;
  /** 2-3 highlighted traits. */
  keyTraits: string[];
}

/** Human explanation of the dominant/auxiliary MBTI cognitive dynamics. */
export interface CompatibilidadMBTI {
  tipo1: string;
  tipo2: string;
  funcionesComplementarias: string;
  dinamicaNatural: string;
}

/** Similarity and warm interpretation for one shared Big Five dimension. */
export interface AfinidadBigFive {
  dimension: string;
  /** Clamped to 0-1 and rounded to two decimals. */
  similitud: number;
  interpretacion: string;
}

/**
 * The human-readable psychological justification shown in the detail sheet.
 * This is the exact contract requested by the product brief; the richer
 * `MatchExplanation` below adds the chemistry summary and affinity bars.
 * Alias fields preserve the original contract while offering canonical names.
 */
export interface MatchNarrative {
  track: MatchTrack;
  scorePorcentaje: number;
  tituloQuimica: string;
  porQueFunciona: string;
  dinamicaCotidiana: string;
  puntoDeAtencion: string;
  /** Canonical alias of `scorePorcentaje`. */
  porcentajeQuimica: number;
  /** Canonical alias of `tituloQuimica`. */
  tituloConexion: string;
  /** Friendship-only psychological rationale; null for romance. */
  porQueBuenaAmistad: string | null;
  /** Romance-only psychological rationale; null for friendship. */
  porQuePosibleRomance: string | null;
  /** Canonical alias of `puntoDeAtencion`. */
  dondeCrecer: string;
  /** Null unless both values are valid MBTI codes among the 16 known types. */
  compatibilidadMBTI: CompatibilidadMBTI | null;
  /** Shared dimensions, sorted from highest to lowest similarity. */
  afinidadBigFive: AfinidadBigFive[];
}

export interface MatchExplanation extends MatchNarrative {
  chemistry: ChemistrySummary;
  breakdown: AffinityBreakdown[];
  personalitySummary: PersonalitySummary;
  /** One-line poetic summary of the connection. */
  headline: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

/** Score bounds used for Big Five complementary-trait comparisons. */
const HIGH_SCORE = 0.6;
const LOW_SCORE = 0.4;

/** Ordered dimension arrays per track (identical order to the stored vectors). */
const TRACK_DIMENSIONS: Record<MatchTrack, readonly string[]> = {
  romance: ROMANCE_VECTOR_DIMENSIONS,
  amistad: FRIENDSHIP_VECTOR_DIMENSIONS,
};

const MATCHING_CONFIG = getMatchingConfig();
const TRACK_THRESHOLDS: Record<MatchTrack, number> = {
  romance: MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
  amistad: MATCHING_CONFIG.tracks.amistad.minimum_similarity_exclusive,
};

/** Fixed display order for categories (only those present in a track appear). */
const CATEGORY_DISPLAY_ORDER: readonly AffinityCategory[] = [
  "personalidad",
  "afinidad_cultural",
  "intimidad_afecto",
  "valores_relacionales",
  "identidad",
];

const CATEGORY_LABELS: Record<AffinityCategory, string> = {
  personalidad: "Personalidad",
  afinidad_cultural: "Gustos culturales",
  intimidad_afecto: "Intimidad y afecto",
  valores_relacionales: "Valores relacionales",
  identidad: "Identidad y compromiso",
};

const CATEGORY_ICONS: Record<AffinityCategory, string> = {
  personalidad: "🧠",
  afinidad_cultural: "🎨",
  intimidad_afecto: "💝",
  valores_relacionales: "⚖️",
  identidad: "🌈",
};

const LEVEL_LABELS: Record<ChemistryLevel, string> = {
  almas_gemelas: "Almas gemelas",
  quimica_excepcional: "Química excepcional",
  quimica_fuerte: "Química fuerte",
  buena_quimica: "Buena química",
  quimica_moderada: "Química moderada",
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Deterministic 32-bit string hash (mirrors the profile generator's hash). */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // coerce to 32-bit integer
  }
  return Math.abs(hash);
}

/** Maps a scoring dimension name to its affinity category (or null). */
function categoryOfDimension(dimension: string): AffinityCategory | null {
  if (dimension.startsWith("personalidad_") || dimension.startsWith("mbti_")) return "personalidad";
  if (dimension.startsWith("identidad_")) return "identidad";
  if (dimension.startsWith("cultural_")) return "afinidad_cultural";
  if (dimension.startsWith("intimidad_")) return "intimidad_afecto";
  if (dimension.startsWith("valores_")) return "valores_relacionales";
  return null;
}

// ─── Affinity phrase templates ────────────────────────────────────────────────

interface PhraseRule {
  /** Inclusive lower bound for the percentage (checked high → low). */
  min: number;
  /** Template; `{percentage}` is interpolated when present. */
  text: string;
}

/**
 * Per-category phrase ladders. Rules are evaluated from highest `min` to
 * lowest; the first rule whose `min` is <= the percentage wins. The final rule
 * of each ladder uses `min: 0` so a phrase always exists.
 */
const PHRASE_LADDERS: Record<AffinityCategory, readonly PhraseRule[]> = {
  personalidad: [
    {
      min: 90,
      text: "Sus personalidades se entienden sin necesidad de palabras — son como dos piezas del mismo rompecabezas",
    },
    {
      min: 80,
      text: "Tienen una conexión de personalidad poco común: sus formas de ser se complementan de manera natural",
    },
    {
      min: 70,
      text: "Sus personalidades tienen una buena sintonía — comparten ritmos y energías similares",
    },
    {
      min: 0,
      text: "Aunque son diferentes, sus personalidades crean un contraste interesante que puede enriquecer la relación",
    },
  ],
  afinidad_cultural: [
    {
      min: 90,
      text: "Tienen un {percentage}% de afinidad en gustos culturales — probablemente podrían pasar horas explorando música, arte y hobbies juntxs",
    },
    {
      min: 80,
      text: "Comparten una vibra cultural muy similar: mismos gustos, mismas pasiones, mismo humor",
    },
    {
      min: 70,
      text: "Sus mundos culturales tienen bastante en común — seguro encuentran planes que a ambxs les encanten",
    },
    {
      min: 0,
      text: "Sus gustos culturales son distintos, lo que significa que pueden descubrir mundos nuevxs a través del otrx",
    },
  ],
  intimidad_afecto: [
    {
      min: 90,
      text: "Sus lenguajes del amor hablan el mismo idioma — se van a entender en lo profundo",
    },
    {
      min: 80,
      text: "Tienen una compatibilidad afectiva hermosa: saben dar y recibir amor de formas compatibles",
    },
    {
      min: 70,
      text: "Sus formas de expresar cariño tienen buena sintonía, con espacio para crecer juntxs",
    },
    {
      min: 0,
      text: "Expresan el afecto de maneras diferentes, lo cual puede ser una oportunidad para aprender del otrx",
    },
  ],
  valores_relacionales: [
    {
      min: 90,
      text: "Comparten la misma visión en dinámicas de relación — sus valores están perfectamente alineados",
    },
    {
      min: 80,
      text: "Sus valores relacionales son muy compatibles: misma visión de confianza, respeto y equidad",
    },
    {
      min: 70,
      text: "Tienen bases de valores similares que les permitirán construir algo sólido",
    },
    {
      min: 0,
      text: "Sus valores tienen matices distintos, lo que puede generar conversaciones enriquecedoras",
    },
  ],
  identidad: [
    { min: 90, text: "Comparten la misma visión de compromiso y comunicación afectiva" },
    { min: 80, text: "Sus expectativas relacionales están muy alineadas" },
    { min: 70, text: "Tienen visiones compatibles sobre lo que buscan en una relación" },
    {
      min: 0,
      text: "Sus visiones relacionales difieren un poco — vale la pena conversar sobre expectativas",
    },
  ],
};

function phraseForCategory(category: AffinityCategory, percentage: number): string {
  const ladder = PHRASE_LADDERS[category];
  for (const rule of ladder) {
    if (percentage >= rule.min) {
      return rule.text.replace("{percentage}", String(percentage));
    }
  }
  // Unreachable: every ladder ends with a `min: 0` rule.
  return ladder[ladder.length - 1]!.text.replace("{percentage}", String(percentage));
}

// ─── MBTI descriptors (all 16 codes) ──────────────────────────────────────────

interface MbtiProfile {
  /** Short warm label, e.g. "personalidad mediadora". */
  label: string;
  /** Spanish indefinite article that agrees with `label`. */
  article: "un" | "una";
  /** Warm descriptor clause. */
  descriptor: string;
}

const MBTI_PROFILES: Record<string, MbtiProfile> = {
  INFP: {
    label: "personalidad mediadora",
    article: "una",
    descriptor: "es súper empáticx, ama las conversaciones profundas",
  },
  INFJ: {
    label: "alma visionaria",
    article: "un",
    descriptor: "combina intuición profunda con una calidez que sana",
  },
  INTP: {
    label: "mente analítica",
    article: "una",
    descriptor: "tiene una curiosidad lógica que desarma y fascina",
  },
  INTJ: {
    label: "mente estratega",
    article: "una",
    descriptor: "tiene una visión clara del mundo y una inteligencia que cautiva",
  },
  ENFP: {
    label: "espíritu libre",
    article: "un",
    descriptor: "irradia entusiasmo y convierte cada momento en una aventura",
  },
  ENFJ: {
    label: "corazón guía",
    article: "un",
    descriptor: "inspira a quienes le rodean con una empatía activa y generosa",
  },
  ENTP: {
    label: "chispa creativa",
    article: "una",
    descriptor: "su mente rápida y su humor hacen que nunca te aburras",
  },
  ENTJ: {
    label: "liderazgo natural",
    article: "un",
    descriptor: "su determinación y claridad abren camino a donde vayan",
  },
  ISFP: {
    label: "corazón artístico",
    article: "un",
    descriptor: "vive con una sensibilidad hermosa que inspira a quienes le rodean",
  },
  ISFJ: {
    label: "alma protectora",
    article: "un",
    descriptor: "cuida con una ternura constante y una memoria afectiva admirable",
  },
  ISTP: {
    label: "espíritu práctico",
    article: "un",
    descriptor: "resuelve todo con calma y una destreza que sorprende",
  },
  ISTJ: {
    label: "roca de constancia",
    article: "una",
    descriptor: "su lealtad y su palabra firme dan una seguridad invaluable",
  },
  ESFP: {
    label: "alegría viviente",
    article: "una",
    descriptor: "convierte cualquier día en una celebración contagiosa",
  },
  ESFJ: {
    label: "calidez social",
    article: "una",
    descriptor: "teje comunidad con una generosidad que hace sentir en casa",
  },
  ESTP: {
    label: "energía audaz",
    article: "una",
    descriptor: "su valentía y su ritmo hacen que la vida nunca sea aburrida",
  },
  ESTJ: {
    label: "voluntad organizada",
    article: "una",
    descriptor: "su capacidad de hacer que las cosas sucedan es admirable",
  },
};

const FALLBACK_MBTI: MbtiProfile = {
  label: "personalidad única",
  article: "una",
  descriptor: "tiene una forma de ser irrepetible que invita a conocerle despacio",
};

// ─── Big Five trait labels ────────────────────────────────────────────────────

const BIG_FIVE_TRAIT_LABELS: Record<string, string> = {
  personalidad_apertura: "curiosx",
  personalidad_responsabilidad: "comprometidx",
  personalidad_extraversion: "sociable",
  personalidad_amabilidad: "empáticx",
  personalidad_estabilidad_emocional: "serenx",
};

/** Trait derived from a single MBTI letter (used when Big Five is unavailable). */
const MBTI_LETTER_TRAITS: Record<string, string> = {
  E: "sociable",
  I: "introspectivx",
  N: "imaginativx",
  S: "prácticx",
  T: "analíticx",
  F: "empáticx",
  J: "organizadx",
  P: "espontánex",
};

// ─── Complementary-trait rules (Big Five comparison) ──────────────────────────

interface ComplementaryRule {
  /** Deterministic id (only for readability). */
  id: string;
  /** Predicate over both users' Big Five scores. */
  test: (match: BigFiveReader, user: BigFiveReader) => boolean;
  /** Resulting warm clause (already lowercase, no trailing period). */
  phrase: string;
}

/** Tiny accessor over a `Record<string, number> | null` Big Five score bag. */
interface BigFiveReader {
  high: (dim: string) => boolean;
  low: (dim: string) => boolean;
  has: (dim: string) => boolean;
  value: (dim: string) => number | null;
}

function makeReader(scores: Record<string, number> | null): BigFiveReader {
  const read = (dim: string): number | null => {
    if (!scores) return null;
    const value = scores[dim];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    has: (dim) => read(dim) !== null,
    high: (dim) => {
      const v = read(dim);
      return v !== null && v >= HIGH_SCORE;
    },
    low: (dim) => {
      const v = read(dim);
      return v !== null && v <= LOW_SCORE;
    },
    value: read,
  };
}

const OPENNESS = "personalidad_apertura";
const RESPONSIBILITY = "personalidad_responsabilidad";
const EXTRAVERSION = "personalidad_extraversion";
const AGREEABLENESS = "personalidad_amabilidad";
const STABILITY = "personalidad_estabilidad_emocional";

// ─── Track-aware psychological narrative ─────────────────────────────────────
// Friendship rewards shared openness + agreeableness and explicitly tolerates
// extraversion differences. Romance rewards shared emotional stability and
// MBTI cognitive complementarity. The hard filters are enforced by the matching
// engine *before* a match reaches this module; the narrative simply reminds the
// reader that those filters were respected.

export interface MatchNarrativeInput {
  track: MatchTrack;
  similarity: number;
  userDimensionScores: Record<string, number> | null;
  matchDimensionScores: Record<string, number> | null;
  userMbtiCode: string | null;
  matchMbtiCode: string | null;
  userAnimal: string;
  matchAnimal: string;
}

type CognitiveFunction = "Fi" | "Fe" | "Ti" | "Te" | "Ni" | "Ne" | "Si" | "Se";

const MBTI_COGNITIVE_FUNCTIONS: Record<string, readonly CognitiveFunction[]> = {
  INFP: ["Fi", "Ne", "Si", "Te"],
  INFJ: ["Ni", "Fe", "Ti", "Se"],
  INTP: ["Ti", "Ne", "Si", "Fe"],
  INTJ: ["Ni", "Te", "Fi", "Se"],
  ENFP: ["Ne", "Fi", "Te", "Si"],
  ENFJ: ["Fe", "Ni", "Se", "Ti"],
  ENTP: ["Ne", "Ti", "Fe", "Si"],
  ENTJ: ["Te", "Ni", "Se", "Fi"],
  ISFP: ["Fi", "Se", "Ni", "Te"],
  ISFJ: ["Si", "Fe", "Ti", "Ne"],
  ISTP: ["Ti", "Se", "Ni", "Fe"],
  ISTJ: ["Si", "Te", "Fi", "Ne"],
  ESFP: ["Se", "Fi", "Te", "Ni"],
  ESFJ: ["Fe", "Si", "Ne", "Ti"],
  ESTP: ["Se", "Ti", "Fe", "Ni"],
  ESTJ: ["Te", "Si", "Ne", "Fi"],
};

const COMPLEMENTARY_FUNCTION: Record<CognitiveFunction, CognitiveFunction> = {
  Ne: "Ni",
  Ni: "Ne",
  Se: "Si",
  Si: "Se",
  Te: "Fi",
  Fi: "Te",
  Ti: "Fe",
  Fe: "Ti",
};

/**
 * Returns the complementary cognitive-function pairs between two MBTI codes.
 * Only the dominant and auxiliary functions are compared, which keeps the
 * narrative focused on the two strongest ways each person meets the world.
 */
export function cognitiveComplementarity(
  userMbtiCode: string | null,
  matchMbtiCode: string | null,
): string[] {
  const userFunctions = MBTI_COGNITIVE_FUNCTIONS[userMbtiCode?.trim().toUpperCase() ?? ""] ?? [];
  const matchFunctions = MBTI_COGNITIVE_FUNCTIONS[matchMbtiCode?.trim().toUpperCase() ?? ""] ?? [];
  const pairs: string[] = [];

  for (const userFunction of userFunctions.slice(0, 2)) {
    const complement = COMPLEMENTARY_FUNCTION[userFunction];
    if (matchFunctions.slice(0, 2).includes(complement)) {
      const pair = `${userFunction} ↔ ${complement}`;
      if (!pairs.includes(pair)) pairs.push(pair);
    }
  }
  return pairs;
}

const FUNCTION_HUMAN_LABELS: Record<CognitiveFunction, string> = {
  Fe: "la empatía que cuida el vínculo",
  Fi: "la autenticidad que escucha los valores",
  Ne: "la imaginación que abre posibilidades",
  Ni: "la visión que encuentra significados",
  Se: "la presencia que disfruta el momento",
  Si: "la memoria que da continuidad",
  Te: "la estructura que vuelve reales los planes",
  Ti: "la lógica que ordena las preguntas",
};

const COGNITIVE_PAIR_COPY: Record<string, string> = {
  "Ne|Ni": "Ne ↔ Ni: une abre posibilidades y otre descubre el hilo profundo que las conecta.",
  "Se|Si": "Se ↔ Si: une disfruta el presente y otre aporta memoria y calma para darle continuidad.",
  "Fi|Te": "Fi ↔ Te: une cuida los valores y otre les da estructura para convertirlos en decisiones.",
  "Fe|Ti": "Fe ↔ Ti: une sintoniza con las emociones y otre aclara las ideas cuando hace falta.",
};

const DOMINANT_DYNAMICS: Record<string, string> = {
  "Fe|Fe": "Dúo de cuidado: ambes leen el clima emocional y crean un espacio donde pedir apoyo se siente natural.",
  "Fi|Fi": "Dúo auténtico: se reconocen en la honestidad emocional y respetan los tiempos del mundo interior.",
  "Ne|Ne": "Dúo de posibilidades: una idea enciende otra y la conversación siempre encuentra un camino nuevo.",
  "Ni|Ni": "Dúo visionario: comparten miradas profundas y disfrutan dar sentido a lo que otres pasan por alto.",
  "Se|Se": "Dúo del presente: conectan haciendo, explorando y convirtiendo los planes sencillos en recuerdos vivos.",
  "Si|Si": "Dúo de confianza: la constancia y los pequeños rituales construyen una relación predecible y tierna.",
  "Te|Te": "Dúo de impulso: se entienden al poner metas claras y celebrar lo que logran construir juntes.",
  "Ti|Ti": "Dúo curioso: disfrutan analizar sin prisa y respetan la necesidad de pensar antes de responder.",
  "Fe|Fi": "Mentor-Soñador: la guía empática de une ayuda a otre a confiar en su mundo interior; la ternura circula sin exigir que sean iguales.",
  "Fe|Ni": "Guía-Visionarie: el cuidado de une da aire a la visión de otre y las conversaciones encuentran un rumbo compasivo.",
  "Fe|Ne": "Guía-Exploradore: el entusiasmo se vuelve cercanía cuando une propone posibilidades y otre cuida el ritmo del vínculo.",
  "Fi|Ne": "Soñadore-Exploradore: imaginación y autenticidad se retroalimentan en conversaciones que se sienten libres y sinceras.",
  "Ne|Ni": "Exploradore-Visionarie: une multiplica caminos y otre encuentra su sentido; la diferencia enciende curiosidad, no competencia.",
  "Fi|Ni": "Soñadore-Visionarie: valores e intuiciones profundas crean un refugio para hablar de lo que de verdad importa.",
  "Fi|Te": "Corazón-Estratega: une pone los valores y otre la estructura; negociar ambos lenguajes vuelve el apoyo muy concreto.",
  "Ni|Te": "Visión-Estrategia: las ideas de largo alcance encuentran pasos posibles y cada une reconoce el talento del otre.",
  "Fe|Ti": "Cuidado-Análisis: une escucha el corazón y otre desenreda las preguntas; la paciencia convierte ambos dones en refugio.",
  "Se|Si": "Presente-Memoria: une trae espontaneidad y otre continuidad, creando un ritmo que disfruta lo nuevo sin perder raíces.",
};

function cognitivePairKey(first: CognitiveFunction, second: CognitiveFunction): string {
  return [first, second].sort().join("|");
}

function normalizedMbti(code: string | null): string | null {
  const normalized = code?.trim().toUpperCase() ?? "";
  return MBTI_COGNITIVE_FUNCTIONS[normalized] ? normalized : null;
}

function describeCognitivePairs(pairs: readonly string[]): string {
  return pairs
    .map((pair) => {
      const [first, second] = pair.split(" ↔ ") as [CognitiveFunction, CognitiveFunction];
      return COGNITIVE_PAIR_COPY[cognitivePairKey(first, second)] ?? pair;
    })
    .join(" ");
}

function buildMbtiCompatibility(
  userMbtiCode: string | null,
  matchMbtiCode: string | null,
): CompatibilidadMBTI | null {
  const tipo1 = normalizedMbti(userMbtiCode);
  const tipo2 = normalizedMbti(matchMbtiCode);
  if (!tipo1 || !tipo2) return null;

  const userFunctions = MBTI_COGNITIVE_FUNCTIONS[tipo1]!;
  const matchFunctions = MBTI_COGNITIVE_FUNCTIONS[tipo2]!;
  const pairs = cognitiveComplementarity(tipo1, tipo2);
  const shared = userFunctions
    .slice(0, 2)
    .filter((fn) => matchFunctions.slice(0, 2).includes(fn));

  let funcionesComplementarias: string;
  if (pairs.length > 0) {
    funcionesComplementarias = describeCognitivePairs(pairs);
  } else if (shared.length > 0) {
    funcionesComplementarias = `Comparten ${shared.join(" y ")}: ${FUNCTION_HUMAN_LABELS[shared[0]!]}; ese terreno común facilita entenderse con naturalidad.`;
  } else {
    funcionesComplementarias =
      "Sus funciones principales siguen rutas distintas; la afinidad puede crecer al traducir esos estilos con curiosidad.";
  }

  const dominantKey = cognitivePairKey(userFunctions[0]!, matchFunctions[0]!);
  const dinamicaNatural =
    DOMINANT_DYNAMICS[dominantKey] ??
    `Dinámica ${userFunctions[0]}-${matchFunctions[0]}: combinan ${FUNCTION_HUMAN_LABELS[userFunctions[0]!]} con ${FUNCTION_HUMAN_LABELS[matchFunctions[0]!]}; escucharse las vuelve apoyo mutuo.`;

  return { tipo1, tipo2, funcionesComplementarias, dinamicaNatural };
}

interface TraitGap {
  dimension: string;
  label: string;
  value: number;
}

const NARRATIVE_DIMENSIONS: Record<MatchTrack, readonly string[]> = {
  romance: [STABILITY, EXTRAVERSION, RESPONSIBILITY, AGREEABLENESS, OPENNESS],
  amistad: [EXTRAVERSION, OPENNESS, RESPONSIBILITY, AGREEABLENESS, STABILITY],
};

const DIMENSION_NARRATIVE_LABELS: Record<string, string> = {
  [OPENNESS]: "apertura",
  [RESPONSIBILITY]: "organización",
  [EXTRAVERSION]: "energía social",
  [AGREEABLENESS]: "ternura",
  [STABILITY]: "estabilidad emocional",
};

const BIG_FIVE_DISPLAY_LABELS: Record<string, string> = {
  [OPENNESS]: "Apertura Mental",
  [RESPONSIBILITY]: "Responsabilidad",
  [EXTRAVERSION]: "Energía Social",
  [AGREEABLENESS]: "Amabilidad",
  [STABILITY]: "Estabilidad Emocional",
};

type SimilarityBand = "alta" | "media" | "baja";

function similarityBand(similarity: number): SimilarityBand {
  if (similarity >= 0.85) return "alta";
  if (similarity >= 0.65) return "media";
  return "baja";
}

function bigFiveInterpretation(
  dimension: string,
  band: SimilarityBand,
  track: MatchTrack,
): string {
  switch (dimension) {
    case OPENNESS:
      if (band === "alta") {
        return "Comparten una curiosidad muy cercana; imaginar, aprender y hacerse preguntas puede volverse un plan favorito.";
      }
      if (band === "media") {
        return "Hay curiosidad suficiente para encontrarse, con espacio para negociar cuánta novedad o rutina necesita cada une.";
      }
      return "Exploran el mundo desde ritmos distintos; pueden descubrir ideas nuevas si proponen sin presionar y escuchan al otre.";
    case RESPONSIBILITY:
      if (band === "alta") {
        return "Sus formas de cumplir y organizarse se parecen; los acuerdos pueden sentirse claros y confiables.";
      }
      if (band === "media") {
        return "Tienen una base parecida para cumplir acuerdos, aunque conviene ajustar cuánta estructura quiere cada une.";
      }
      return "Planean de maneras distintas; acordar lo esencial y dejar espacio para improvisar evita que la logística pese.";
    case EXTRAVERSION:
      if (band === "alta") {
        return "Sus baterías sociales tienen un ritmo cercano; les será más fácil elegir planes sin que une se quede sin energía.";
      }
      if (band === "media") {
        return "Sus ritmos sociales se parecen lo suficiente para encontrarse, con pequeños ajustes entre convivencia y descanso.";
      }
      return track === "amistad"
        ? "Sus energías sociales se equilibran: une puede abrir el plan y otre cuidar la calma; la diferencia suma opciones."
        : "Une busca más movimiento y otre más recogimiento; turnar planes sociales y citas tranquilas puede volverlos buen equipo.";
    case AGREEABLENESS:
      if (band === "alta") {
        return "Se acercan con una ternura parecida; escuchar, reparar y pedir perdón puede sentirse como un terreno seguro.";
      }
      if (band === "media") {
        return "Comparten bastante disposición al cuidado, aunque el tono de la honestidad puede necesitar pequeños ajustes.";
      }
      return "Expresan el cuidado de formas distintas; preguntar antes de aconsejar ayuda a que la honestidad llegue con ternura.";
    case STABILITY:
      if (band === "alta") {
        return "Sus maneras de atravesar emociones se parecen; esa sintonía ayuda a ofrecer calma sin minimizar lo que siente el otre.";
      }
      if (band === "media") {
        return "Tienen recursos emocionales cercanos; nombrar lo que necesitan en los días intensos mantendrá esa sintonía.";
      }
      return "Viven el estrés con intensidades distintas; pausar y preguntar qué necesita el otre evita sostenerse desde la urgencia.";
    default:
      return "Esta dimensión ofrece una pista para conocerse con curiosidad y conversar sobre lo que cada une necesita.";
  }
}

function buildBigFiveAffinity(
  track: MatchTrack,
  user: BigFiveReader,
  match: BigFiveReader,
): AfinidadBigFive[] {
  const entries: Array<AfinidadBigFive & { order: number }> = [];

  BIG_FIVE_DIMENSIONS.forEach((dimension, order) => {
    const userValue = user.value(dimension);
    const matchValue = match.value(dimension);
    if (userValue === null || matchValue === null) return;

    const rawSimilarity = clamp01(1 - Math.abs(userValue - matchValue));
    const similarity = Math.round(rawSimilarity * 100) / 100;
    entries.push({
      dimension: BIG_FIVE_DISPLAY_LABELS[dimension] ?? dimension,
      similitud: similarity,
      interpretacion: bigFiveInterpretation(
        dimension,
        similarityBand(rawSimilarity),
        track,
      ),
      order,
    });
  });

  return entries
    .sort((a, b) => b.similitud - a.similitud || a.order - b.order)
    .map(({ dimension, similitud, interpretacion }) => ({
      dimension,
      similitud,
      interpretacion,
    }));
}

function largestTraitGap(
  track: MatchTrack,
  user: BigFiveReader,
  match: BigFiveReader,
): TraitGap | null {
  let largest: TraitGap | null = null;
  for (const dimension of NARRATIVE_DIMENSIONS[track]) {
    const userValue = user.value(dimension);
    const matchValue = match.value(dimension);
    if (userValue === null || matchValue === null) continue;
    const gap = Math.abs(userValue - matchValue);
    if (!largest || gap > largest.value) {
      largest = {
        dimension,
        label: DIMENSION_NARRATIVE_LABELS[dimension] ?? dimension,
        value: gap,
      };
    }
  }
  return largest;
}

function romanceTitle(
  user: BigFiveReader,
  match: BigFiveReader,
  pairs: readonly string[],
): string {
  const sharedStability = user.high(STABILITY) && match.high(STABILITY);
  if (sharedStability && pairs.length > 0) return "Chispa de Calma y Complemento";
  if (sharedStability) return "Refugio Emocional con Chispa";
  if (pairs.length > 0) return "Atracción de Mentes Complementarias";
  if (user.high(AGREEABLENESS) && match.high(AGREEABLENESS)) {
    return "Química de Ternura Compartida";
  }
  return "Pulso de Curiosidad Mutua";
}

function friendshipTitle(
  user: BigFiveReader,
  match: BigFiveReader,
  extraversionGap: number,
): string {
  const sharedOpenness = user.high(OPENNESS) && match.high(OPENNESS);
  const sharedAgreeableness = user.high(AGREEABLENESS) && match.high(AGREEABLENESS);
  if (sharedOpenness && sharedAgreeableness) return "Conexión Creativa y Complementaria";
  if (sharedOpenness) return "Curiosidad que Se Comparte";
  if (sharedAgreeableness) return "Sintonía de Apertura y Empatía";
  if (extraversionGap >= 0.35) return "Ritmos Distintos, Misma Sintonía";
  return "Refugio de Confianza Curiosa";
}

function romanceRationale(
  user: BigFiveReader,
  match: BigFiveReader,
  pairs: readonly string[],
): string {
  const sentences: string[] = [
    "En romance, el motor pondera sobre todo la estabilidad emocional compartida y la complementariedad cognitiva.",
  ];

  if (user.high(STABILITY) && match.high(STABILITY)) {
    sentences.push(
      "Ambos tienden a buscar calma y seguridad antes que drama, y esa base hace que el vínculo se sienta más tranquilo.",
    );
  } else if (user.low(STABILITY) || match.low(STABILITY)) {
    sentences.push(
      "Une vive las emociones con más intensidad; la calma del otre puede sostener, siempre que no se convierta en silencio.",
    );
  }

  if (pairs.length > 0) {
    sentences.push(
      `Sus formas de pensar se complementan (${pairs.join(", ")}): une aporta una perspectiva y otre la traduce en otra, y esa fricción creativa enciende la chispa.`,
    );
  } else {
    sentences.push(
      "Sus estilos cognitivos se parecen, así que la chispa vendrá de la curiosidad compartida y de la seguridad que se dan mutuamente.",
    );
  }

  if (user.high(AGREEABLENESS) && match.high(AGREEABLENESS)) {
    sentences.push("La ternura mutua ayuda a que los desacuerdos no se conviertan en heridas.");
  }

  sentences.push(
    "Los filtros de identidad y orientación ya se verificaron en ambos sentidos, así que esta conexión parte de un terreno respetuoso.",
  );
  return sentences.join(" ");
}

function friendshipRationale(
  user: BigFiveReader,
  match: BigFiveReader,
  extraversionGap: number,
): string {
  const sentences: string[] = [
    "En amistad, el motor pesa sobre todo la apertura mental y la amabilidad.",
  ];
  const sharedOpenness = user.high(OPENNESS) && match.high(OPENNESS);
  const sharedAgreeableness = user.high(AGREEABLENESS) && match.high(AGREEABLENESS);

  if (sharedOpenness) {
    sentences.push(
      "Ambos disfrutan explorar ideas, planes y formas nuevas de mirar el campus, así que las conversaciones tienen material para rato.",
    );
  } else if (user.high(OPENNESS) || match.high(OPENNESS)) {
    sentences.push(
      "Une trae la curiosidad de probar cosas nuevas y le contagia a otre esa chispa sin presionar.",
    );
  }

  if (sharedAgreeableness) {
    sentences.push(
      "La amabilidad compartida crea un espacio seguro para mostrarse cansade, raro o intenso sin miedo al juicio.",
    );
  } else if (user.high(AGREEABLENESS) || match.high(AGREEABLENESS)) {
    sentences.push(
      "La ternura de une suaviza los días de otre y hace que el vínculo se sienta cuidado.",
    );
  }

  if (extraversionGap >= 0.35) {
    sentences.push(
      "La diferencia de extraversión no resta: une recarga con gente y otre con calma, y juntes encuentran un ritmo que incluye a ambos.",
    );
  }

  if (user.high(RESPONSIBILITY) && match.high(RESPONSIBILITY)) {
    sentences.push("También comparten constancia, así que los planes no se quedan en la intención.");
  }

  if (sentences.length === 1) {
    sentences.push(
      "Aunque sus rasgos más altos no coinciden, la combinación crea un contraste que puede enriquecer la amistad.",
    );
  }
  return sentences.join(" ");
}

function sharedDimensionSimilarity(
  user: BigFiveReader,
  match: BigFiveReader,
  dimension: string,
): number | null {
  const userValue = user.value(dimension);
  const matchValue = match.value(dimension);
  if (userValue === null || matchValue === null) return null;
  return clamp01(1 - Math.abs(userValue - matchValue));
}

function friendshipConnectionRationale(
  user: BigFiveReader,
  match: BigFiveReader,
): string {
  const reasons: string[] = [];
  const opennessSimilarity = sharedDimensionSimilarity(user, match, OPENNESS);
  const agreeablenessSimilarity = sharedDimensionSimilarity(user, match, AGREEABLENESS);

  if (opennessSimilarity !== null && opennessSimilarity >= 0.85) {
    reasons.push(
      "Su apertura se reconoce: hay curiosidad y hambre de ideas para conversar, imaginar y descubrir el campus juntes.",
    );
  }
  if (agreeablenessSimilarity !== null && agreeablenessSimilarity >= 0.85) {
    reasons.push(
      "La amabilidad los acerca a un mismo lenguaje de empatía, creando un espacio seguro para mostrarse como son.",
    );
  }

  const complementaryExtraversion =
    (user.high(EXTRAVERSION) && match.low(EXTRAVERSION)) ||
    (match.high(EXTRAVERSION) && user.low(EXTRAVERSION));
  if (complementaryExtraversion) {
    reasons.push(
      "En extraversión se equilibran: une anima a salir y otre recuerda el gusto por bajar el ritmo, sin que ningune tenga que cambiar.",
    );
  }
  if (user.high(RESPONSIBILITY) && match.high(RESPONSIBILITY)) {
    reasons.push(
      "Comparten responsabilidad y constancia: cuando se prometen un plan, pueden confiar en que ambes harán su parte.",
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "Su amistad puede crecer desde la curiosidad mutua: sus ritmos no son idénticos, pero sí pueden abrirse un lugar con respeto.",
    );
  }
  return reasons.slice(0, 3).join(" ");
}

function romanceConnectionRationale(
  user: BigFiveReader,
  match: BigFiveReader,
  pairs: readonly string[],
  gap: TraitGap | null,
): string {
  const reasons: string[] = [];
  const sharedStability = user.high(STABILITY) && match.high(STABILITY);

  if (sharedStability) {
    reasons.push(
      "Su estabilidad emocional compartida permite imaginar un vínculo sin miedos, donde acercarse no exige adivinar ni defenderse.",
    );
  }
  if (pairs.length > 0) {
    reasons.push(describeCognitivePairs(pairs));
  }
  if (sharedStability && user.high(AGREEABLENESS) && match.high(AGREEABLENESS)) {
    reasons.push(
      "La amabilidad sumada a esa calma hace espacio para un cariño sin drama: cuidarse y decir la verdad pueden ir de la mano.",
    );
  }
  if (reasons.length < 3 && gap && gap.value >= 0.35) {
    reasons.push(
      "Lo que a une le cuesta, otre puede aportarlo con naturalidad; sus diferencias se vuelven apoyo cuando las piden sin darlas por sentadas.",
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      "La chispa puede crecer al conocer sus ritmos con honestidad y descubrir qué formas de cariño hacen sentir en casa a ambes.",
    );
  }

  reasons.push(
    "Los filtros duros de identidad y orientación ya se verificaron en ambos sentidos; esta posibilidad parte del respeto mutuo.",
  );
  return reasons.slice(0, 4).join(" ");
}

function dailyDynamic(
  track: MatchTrack,
  user: BigFiveReader,
  match: BigFiveReader,
  pairs: readonly string[],
  extraversionGap: number,
): string {
  if (track === "amistad") {
    if (user.high(OPENNESS) && match.high(OPENNESS)) {
      return "Se imaginarían en la biblioteca saltando de un tema a otro, con una playlist compartida y un plan que nace de una idea suelta.";
    }
    if (extraversionGap >= 0.35) {
      return "Une propone el plan del viernes y otre elige el rincón tranquilo; entre los dos encuentran un equilibrio que no agota a nadie.";
    }
    if (user.high(AGREEABLENESS) && match.high(AGREEABLENESS)) {
      return "Probablemente son ese par que se guarda un lugar en la cafetería y nota cuando el otre llega cansade.";
    }
    return "Se verían compartiendo apuntes, memes y ese silencio cómodo que solo existe entre amistades que se entienden.";
  }

  if (user.high(STABILITY) && match.high(STABILITY)) {
    return "Un café después de clases, caminar sin prisa y hablar de lo que de verdad importa; la calma se siente segura.";
  }
  if (pairs.length > 0) {
    return "Une trae la idea y otre la aterriza; las conversaciones se alargan hasta que cierran la biblioteca.";
  }
  if (user.high(AGREEABLENESS) && match.high(AGREEABLENESS)) {
    return "Detalles pequeños: un mensaje a media tarde, un abrazo que llega justo cuando se necesita.";
  }
  return "Planes sencillos que se vuelven importantes: estudiar juntes, cocinar algo, perder la noción del tiempo hablando.";
}

function attentionPoint(
  track: MatchTrack,
  user: BigFiveReader,
  match: BigFiveReader,
  gap: TraitGap | null,
): string {
  if (user.low(EXTRAVERSION) && match.low(EXTRAVERSION)) {
    return "Como ambes son muy introspectives, conviene iniciar las conversaciones difíciles en vez de guardarlo todo; una pregunta amable puede abrir el espacio.";
  }
  if (
    (user.high(RESPONSIBILITY) && match.low(RESPONSIBILITY)) ||
    (match.high(RESPONSIBILITY) && user.low(RESPONSIBILITY))
  ) {
    return "Une disfruta planear y otre necesita espontaneidad; negocien estructura y libertad con ternura, sin convertir los planes en una prueba de cariño.";
  }
  if (user.low(STABILITY) && match.low(STABILITY)) {
    return "En estrés, sus emociones podrían amplificarse; practiquen pausas y turnos para ser el ancla del otre, sin cargar con todo a la vez.";
  }

  if (!gap || gap.value < 0.25) {
    return track === "romance"
      ? "La relación tiene bases sólidas; el punto de atención es mantener la conversación sobre identidad, límites y expectativas."
      : "No hay un punto crítico evidente; cuiden la comunicación y sigan preguntándose cómo se sienten une con otre.";
  }

  if (track === "amistad") {
    switch (gap.dimension) {
      case EXTRAVERSION:
        return "La diferencia de energía social puede cansar si no se habla: acuerden planes con gente y tardes tranquilas para que nadie se agote.";
      case RESPONSIBILITY:
        return "Los ritmos de organización son distintos. Un calendario compartido y acuerdos explícitos evitan que une cargue con toda la logística.";
      case OPENNESS:
        return "Lo nuevo entusiasma a une y puede abrumar a otre; prueben la novedad en dosis y pregunten antes de cambiar el plan.";
      case AGREEABLENESS:
        return "La franqueza de une puede sentirse dura para otre; pidan permiso antes de dar feedback y cuiden el tono.";
      default:
        return `La diferencia en ${gap.label} merece una conversación honesta; nombren lo que cada une necesita antes de que se acumule.`;
    }
  }

  switch (gap.dimension) {
    case STABILITY:
      return "Cuando llegue el estrés, nombren lo que sienten antes de intentar resolver. La calma de une no debe volverse silencio, ni la intensidad de otre una urgencia.";
    case EXTRAVERSION:
      return "El ritmo social distinto puede desgastar; reserven tiempo juntes y también espacios de recarga individual.";
    case RESPONSIBILITY:
      return "Distintas formas de planear; acuerden quién lleva qué y revisen expectativas sin juicio.";
    case AGREEABLENESS:
      return "En los desacuerdos, cuiden el tono; la honestidad sin ternura puede sonar a ataque.";
    default:
      return "La novedad y la rutina se viven distinto; negocien cuánto cambio necesitan y cuánto refugio.";
  }
}

/**
 * Builds the narrative half of the explanation. Pure and deterministic: the
 * same inputs always produce the same text.
 */
export function buildMatchNarrative(input: MatchNarrativeInput): MatchNarrative {
  const user = makeReader(input.userDimensionScores);
  const match = makeReader(input.matchDimensionScores);
  const pairs = cognitiveComplementarity(input.userMbtiCode, input.matchMbtiCode);
  const gap = largestTraitGap(input.track, user, match);
  const extraversionGap = Math.abs(
    (user.value(EXTRAVERSION) ?? 0.5) - (match.value(EXTRAVERSION) ?? 0.5),
  );
  const scorePorcentaje = Math.round(clamp01(input.similarity) * 100);
  const tituloQuimica =
    input.track === "romance"
      ? romanceTitle(user, match, pairs)
      : friendshipTitle(user, match, extraversionGap);
  const puntoDeAtencion = attentionPoint(input.track, user, match, gap);

  return {
    track: input.track,
    scorePorcentaje,
    tituloQuimica,
    porQueFunciona:
      input.track === "romance"
        ? romanceRationale(user, match, pairs)
        : friendshipRationale(user, match, extraversionGap),
    dinamicaCotidiana: dailyDynamic(input.track, user, match, pairs, extraversionGap),
    puntoDeAtencion,
    porcentajeQuimica: scorePorcentaje,
    tituloConexion: tituloQuimica,
    porQueBuenaAmistad:
      input.track === "amistad" ? friendshipConnectionRationale(user, match) : null,
    porQuePosibleRomance:
      input.track === "romance" ? romanceConnectionRationale(user, match, pairs, gap) : null,
    dondeCrecer: puntoDeAtencion,
    compatibilidadMBTI: buildMbtiCompatibility(input.userMbtiCode, input.matchMbtiCode),
    afinidadBigFive: buildBigFiveAffinity(input.track, user, match),
  };
}

/**
 * Complementary phrases, evaluated in order. The first rule whose predicate is
 * satisfied wins, keeping the output deterministic. Contains 14 variants.
 */
const COMPLEMENTARY_RULES: readonly ComplementaryRule[] = [
  {
    id: "user-extro-match-intro",
    test: (m, u) => u.high(EXTRAVERSION) && m.low(EXTRAVERSION),
    phrase: "su energía tranquila es el refugio perfecto para tu ritmo acelerado",
  },
  {
    id: "match-extro-user-intro",
    test: (m, u) => m.high(EXTRAVERSION) && u.low(EXTRAVERSION),
    phrase: "su entusiasmo enciende tus días más silenciosos",
  },
  {
    id: "both-openness",
    test: (m, u) => m.high(OPENNESS) && u.high(OPENNESS),
    phrase: "comparten esa curiosidad infinita que los lleva a explorar juntxs",
  },
  {
    id: "match-agreeable",
    test: (m) => m.high(AGREEABLENESS),
    phrase: "su bondad natural crea un espacio seguro a tu lado",
  },
  {
    id: "both-responsibility",
    test: (m, u) => m.high(RESPONSIBILITY) && u.high(RESPONSIBILITY),
    phrase: "juntxs son un equipo imparable que construye con intención",
  },
  {
    id: "both-stability",
    test: (m, u) => m.high(STABILITY) && u.high(STABILITY),
    phrase: "sus temperamentos en calma se sostienen mutuamente sin drama",
  },
  {
    id: "user-open-match-closed",
    test: (m, u) => u.high(OPENNESS) && m.low(OPENNESS),
    phrase: "tu visión amplia le muestra mundos que aún no descubre",
  },
  {
    id: "match-open-user-closed",
    test: (m, u) => m.high(OPENNESS) && u.low(OPENNESS),
    phrase: "su curiosidad te invita a salir de tu zona cómoda con ternura",
  },
  {
    id: "both-agreeable",
    test: (m, u) => m.high(AGREEABLENESS) && u.high(AGREEABLENESS),
    phrase: "la ternura mutua hace que cuidarse sea algo natural",
  },
  {
    id: "both-extro",
    test: (m, u) => m.high(EXTRAVERSION) && u.high(EXTRAVERSION),
    phrase: "su energía social combinada convierte cualquier plan en una fiesta",
  },
  {
    id: "user-responsible-match-free",
    test: (m, u) => u.high(RESPONSIBILITY) && m.low(RESPONSIBILITY),
    phrase: "tu constancia le da estructura justo cuando la necesita",
  },
  {
    id: "match-stable-user-intense",
    test: (m, u) => m.high(STABILITY) && u.low(STABILITY),
    phrase: "su serenidad equilibra tus mareas emocionales",
  },
  {
    id: "both-intro",
    test: (m, u) => m.low(EXTRAVERSION) && u.low(EXTRAVERSION),
    phrase: "comparten el gusto por la calma y los momentos íntimos",
  },
  {
    id: "fallback",
    test: () => true,
    phrase: "sus diferencias se complementan de una forma que sorprende",
  },
];

// ─── Headline pools ───────────────────────────────────────────────────────────

/** Category-specific headline variants (>= 20 total across all categories). */
const CATEGORY_HEADLINES: Record<AffinityCategory, readonly string[]> = {
  personalidad: [
    "Dos almas que se reconocen sin necesidad de explicaciones",
    "Sus formas de ser encajan como si hubieran sido diseñadas juntas",
    "Una conexión de personalidades que se sienten como hogar",
    "Se entienden en un idioma que solo ellxs hablan",
    "Dos maneras de ser que se complementan con una naturalidad rara",
  ],
  afinidad_cultural: [
    "Mismos gustos, mismas pasiones, misma frecuencia",
    "Comparten la banda sonora de una historia que apenas comienza",
    "Sus mundos culturales se abrazan en cada detalle",
    "Podrían pasar horas hablando de lo mismo sin agotarse",
    "Una vibra compartida que convierte cualquier plan en aventura",
  ],
  intimidad_afecto: [
    "Sus corazones hablan el mismo idioma del amor",
    "Se cuidan con una ternura que no necesita traducción",
    "Sus lenguajes del afecto se encontraron en el momento justo",
    "Una intimidad que se construye desde la misma sensibilidad",
    "Aman y se dejan amar de formas que encajan",
  ],
  valores_relacionales: [
    "Construyendo desde los mismos cimientos",
    "Comparten la brújula que guía sus relaciones",
    "Los mismos valores sostienen este vínculo",
    "Mirando hacia el mismo horizonte de respeto y confianza",
    "Una alianza tejida con hilos de valores compartidos",
  ],
  identidad: [
    "Buscan lo mismo y lo saben sin decirlo",
    "Sus expectativas se encontraron en el mismo punto",
    "Una visión compartida de lo que significa estar juntxs",
    "Saben lo que quieren y lo quieren de la misma forma",
    "Sus compromisos se alinean con una claridad hermosa",
  ],
};

/** Animal-metaphor headline templates ({user} / {match} are interpolated). */
const ANIMAL_HEADLINES: readonly string[] = [
  "Como {user} y {match}, sus energías se complementan perfectamente",
  "{user} y {match}: dos naturalezas que se reconocen al instante",
  "La magia entre {user} y {match} no necesita explicación",
  "{user} encontró en {match} su contraparte perfecta",
  "Entre {user} y {match} hay una química que se siente en el campus",
];

/** Fallback headline when the breakdown is empty. */
const FALLBACK_HEADLINE = "Dos energías que se encontraron en el mismo campus";

// ─── Chemistry summary ────────────────────────────────────────────────────────

/**
 * Computes a chemistry summary from a raw similarity score.
 *
 * - `percentage` is `round(similarity * 100)`.
 * - `displayText` is track-aware ("Compatibilidad" for romance,
 *   "Química Amistosa" for friendship).
 * - `level` maps the similarity onto the track's valid range. Because raw
 *   centered/category-weighted cosine values are compressed (typically
 *   0.65-0.80), absolute 80/85/90 bands would label almost every valid match
 *   "moderada". Bands are therefore relative to the configured threshold:
 *   `relative = (similarity - threshold) / (1 - threshold)`.
 */
export function computeChemistrySummary(similarity: number, track: MatchTrack): ChemistrySummary {
  const normalized = clamp01(similarity);
  const percentage = Math.round(normalized * 100);
  const noun = track === "romance" ? "Compatibilidad" : "Química Amistosa";
  const threshold = TRACK_THRESHOLDS[track];
  const span = Math.max(1e-9, 1 - threshold);
  const relativePosition = clamp01((normalized - threshold) / span);

  let level: ChemistryLevel;
  if (relativePosition >= 0.70) level = "almas_gemelas";
  else if (relativePosition >= 0.45) level = "quimica_excepcional";
  else if (relativePosition >= 0.25) level = "quimica_fuerte";
  else if (relativePosition >= 0.10) level = "buena_quimica";
  else level = "quimica_moderada";

  return {
    percentage,
    displayText: `${percentage}% de ${noun}`,
    level,
    levelLabel: LEVEL_LABELS[level],
    threshold,
    relativePosition,
  };
}

// ─── Affinity breakdown ───────────────────────────────────────────────────────

/**
 * Generates a detailed affinity breakdown comparing two users' track vectors.
 *
 * For each category present in the track's dimension array:
 *  1. collect that category's indices within the vector,
 *  2. compute per-category affinity as `1 - mean(|a[i] - b[i]|)`,
 *  3. round to a percentage and pick a dynamic affective phrase.
 *
 * Categories are returned in a fixed display order for determinism.
 *
 * @throws If the two vectors and the track dimensions do not share a length.
 */
export function generateAffinityBreakdown(
  vectorA: readonly number[],
  vectorB: readonly number[],
  track: MatchTrack,
): AffinityBreakdown[] {
  const dimensions = TRACK_DIMENSIONS[track];
  if (vectorA.length !== vectorB.length || vectorA.length !== dimensions.length) {
    throw new Error("Vectors and track dimensions must all share the same length");
  }

  // Bucket dimension indices by category.
  const buckets = new Map<AffinityCategory, number[]>();
  for (let index = 0; index < dimensions.length; index += 1) {
    const category = categoryOfDimension(dimensions[index] ?? "");
    if (category === null) continue;
    const bucket = buckets.get(category);
    if (bucket) bucket.push(index);
    else buckets.set(category, [index]);
  }

  const breakdown: AffinityBreakdown[] = [];
  for (const category of CATEGORY_DISPLAY_ORDER) {
    const indices = buckets.get(category);
    if (!indices || indices.length === 0) continue;

    let absoluteDeltaSum = 0;
    for (const index of indices) {
      absoluteDeltaSum += Math.abs((vectorA[index] ?? 0) - (vectorB[index] ?? 0));
    }
    const affinity = clamp01(1 - absoluteDeltaSum / indices.length);
    const percentage = Math.round(affinity * 100);

    breakdown.push({
      category,
      categoryLabel: CATEGORY_LABELS[category],
      percentage,
      phrase: phraseForCategory(category, percentage),
      icon: CATEGORY_ICONS[category],
    });
  }

  return breakdown;
}

// ─── Personality summary ──────────────────────────────────────────────────────

/** Returns Big Five entries present in a score bag, sorted desc by value. */
function sortedBigFive(
  scores: Record<string, number> | null,
): Array<{ dim: string; value: number }> {
  if (!scores) return [];
  const entries: Array<{ dim: string; value: number }> = [];
  for (const dim of BIG_FIVE_DIMENSIONS) {
    const value = scores[dim];
    if (typeof value === "number" && Number.isFinite(value)) {
      entries.push({ dim, value });
    }
  }
  entries.sort((a, b) => b.value - a.value);
  return entries;
}

/** Derives up to 3 traits from an MBTI code's letters. */
function traitsFromMbti(code: string): string[] {
  const traits: string[] = [];
  for (const letter of code.toUpperCase()) {
    const trait = MBTI_LETTER_TRAITS[letter];
    if (trait && !traits.includes(trait)) traits.push(trait);
  }
  return traits.slice(0, 3);
}

/** Builds 2-3 key traits, preferring Big Five scores and padding with MBTI. */
function buildKeyTraits(
  matchMbtiCode: string | null,
  matchBigFiveScores: Record<string, number> | null,
): string[] {
  const traits: string[] = [];

  for (const entry of sortedBigFive(matchBigFiveScores).slice(0, 3)) {
    const label = BIG_FIVE_TRAIT_LABELS[entry.dim];
    if (label && !traits.includes(label)) traits.push(label);
  }

  if (traits.length < 2 && matchMbtiCode) {
    for (const trait of traitsFromMbti(matchMbtiCode)) {
      if (!traits.includes(trait)) traits.push(trait);
      if (traits.length >= 3) break;
    }
  }

  return traits.slice(0, 3);
}

/**
 * Generates a warm, concise personality summary (max 3 lines) for a match,
 * based on their animal archetype, color, MBTI code, and Big Five scores
 * compared against the querying user's Big Five scores.
 *
 * Example:
 *   "Tu match es Abejita Ámbar. Tiene una personalidad mediadora (INFP):
 *    es súper empáticx, ama las conversaciones profundas y su energía
 *    tranquila es el refugio perfecto para tu ritmo acelerado."
 */
export function generatePersonalitySummary(
  matchAnimal: string,
  matchColor: string,
  matchMbtiCode: string | null,
  matchBigFiveScores: Record<string, number> | null,
  userBigFiveScores: Record<string, number> | null,
): PersonalitySummary {
  const animal = matchAnimal.trim();
  const color = matchColor.trim();

  // Line 1 — identity.
  const identity = color.length > 0 ? `${animal} ${color}` : animal;
  const line1 =
    identity.length > 0 ? `Tu match es ${identity}.` : "Tu match es alguien extraordinario.";

  // Line 2 — MBTI-based description.
  const code = matchMbtiCode?.trim().toUpperCase() ?? "";
  const profile = MBTI_PROFILES[code] ?? FALLBACK_MBTI;
  const mbtiLabel = code.length > 0 ? `${profile.label} (${code})` : profile.label;
  const line2 =
    code.length > 0
      ? `Tiene ${profile.article} ${profile.label} (${code}): ${profile.descriptor}`
      : `Tiene ${profile.article} ${profile.label}: ${profile.descriptor}`;

  // Line 3 — complementary trait from Big Five comparison.
  const match = makeReader(matchBigFiveScores);
  const user = makeReader(userBigFiveScores);
  let complementary = COMPLEMENTARY_RULES[COMPLEMENTARY_RULES.length - 1]!.phrase;
  for (const rule of COMPLEMENTARY_RULES) {
    if (rule.test(match, user)) {
      complementary = rule.phrase;
      break;
    }
  }

  const text = `${line1} ${line2} y ${complementary}.`;
  const keyTraits = buildKeyTraits(matchMbtiCode, matchBigFiveScores);

  return { text, mbtiLabel, keyTraits };
}

// ─── Connection headline ──────────────────────────────────────────────────────

/**
 * Generates a one-line poetic headline summarizing the connection.
 *
 * The base pool is drawn from the highest-scoring category in the breakdown;
 * animal-metaphor variants are mixed in. Selection is deterministic, keyed on a
 * hash of both animals plus the track and the top category, so identical inputs
 * always yield the same headline.
 */
export function generateConnectionHeadline(
  breakdown: AffinityBreakdown[],
  track: MatchTrack,
  userAnimal: string,
  matchAnimal: string,
): string {
  const user = userAnimal.trim();
  const match = matchAnimal.trim();

  // Identify the highest-scoring category (ties keep display order).
  let topCategory: AffinityCategory | null = null;
  let topPercentage = -1;
  for (const entry of breakdown) {
    if (entry.percentage > topPercentage) {
      topPercentage = entry.percentage;
      topCategory = entry.category as AffinityCategory;
    }
  }

  if (topCategory === null) {
    return FALLBACK_HEADLINE;
  }

  const animalVariants = ANIMAL_HEADLINES.map((template) =>
    template.replace("{user}", user).replace("{match}", match),
  );
  const pool = [...CATEGORY_HEADLINES[topCategory], ...animalVariants];

  const seed = `${user}|${match}|${track}|${topCategory}`;
  const index = simpleHash(seed) % pool.length;
  return pool[index]!;
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Complete explanation pipeline for a single match. Combines the chemistry
 * summary, affinity breakdown, personality summary, and connection headline
 * into one {@link MatchExplanation} object.
 *
 * @param similarity          Raw track similarity (0-1) for this match.
 * @param vectorA             Querying user's track vector.
 * @param vectorB             Matched user's track vector.
 * @param track               "romance" | "amistad".
 * @param matchAnimal         Matched user's animal diminutive.
 * @param matchColor          Matched user's color name.
 * @param matchMbtiCode       Matched user's MBTI code (or null).
 * @param matchDimensionScores Matched user's full dimension scores (or null).
 * @param userAnimal          Querying user's animal diminutive.
 * @param userDimensionScores Querying user's full dimension scores (or null).
 * @param userMbtiCode        Querying user's MBTI code (or null).
 */
export function generateMatchExplanation(
  similarity: number,
  vectorA: readonly number[],
  vectorB: readonly number[],
  track: MatchTrack,
  matchAnimal: string,
  matchColor: string,
  matchMbtiCode: string | null,
  matchDimensionScores: Record<string, number> | null,
  userAnimal: string,
  userDimensionScores: Record<string, number> | null,
  userMbtiCode: string | null = null,
): MatchExplanation {
  const chemistry = computeChemistrySummary(similarity, track);
  const breakdown = generateAffinityBreakdown(vectorA, vectorB, track);
  const personalitySummary = generatePersonalitySummary(
    matchAnimal,
    matchColor,
    matchMbtiCode,
    matchDimensionScores,
    userDimensionScores,
  );
  const headline = generateConnectionHeadline(breakdown, track, userAnimal, matchAnimal);
  const narrative = buildMatchNarrative({
    track,
    similarity,
    userDimensionScores,
    matchDimensionScores,
    userMbtiCode,
    matchMbtiCode,
    userAnimal,
    matchAnimal,
  });

  return { ...narrative, chemistry, breakdown, personalitySummary, headline };
}
