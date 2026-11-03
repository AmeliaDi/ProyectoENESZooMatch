/**
 * Client-side parser for `GET /api/result`. It never trusts the payload:
 * malformed entries are dropped, badge labels come from a local map and the
 * badge icon is the dimension's category key (rendered as a pixel icon).
 */
import type {
  ChemistrySummary,
  LayerAffinityBand,
  MatchExplanation,
  SharedProfileDto,
  SpriteMark,
} from "@/contracts/result";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import type { CompatibilityBadge } from "@/types/microtest";

import { parseLayers, parseShared } from "./parse-shared";

export { NO_MATCH_MESSAGE };

export interface ResultMatch {
  /** Opaque per-viewer handle (React key only). Never displayed. */
  id?: string | null;
  alias: string;
  animal: string;
  animal_id?: string | null;
  color: string;
  color_id?: string | null;
  color_hex?: string | null;
  mark?: SpriteMark | null;
  mbti_code?: string | null;
  similarity: number;
  chemistry: ChemistrySummary | null;
  badges: CompatibilityBadge[];
  narrative: string;
  explanation: MatchExplanation | null;
  /** Per-layer affinity bands (empty when the API omitted them). */
  layers: LayerAffinityBand[];
  /** What the counterpart chose to share (nothing by default). */
  shared: SharedProfileDto;
}

export interface PublicResult {
  alias: string;
  animal: { id: string; diminutivo_es: string; categoria_fauna: string };
  color: { id: string; nombre: string; hex: string };
  mark: SpriteMark | null;
  narrative: string;
  mbti_code: string | null;
  matches: { romance: ResultMatch[]; amistad: ResultMatch[] };
  fewPeople: boolean;
  no_match_message: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  // Match categories (layered model): what the badges carry now.
  personalidad: "Forma de ser",
  valores: "Lo que les importa",
  dealbreakers: "Planes de vida",
  relacional: "Cómo quieren el vínculo",
  estilo: "Gustos y rutinas",
  conflicto: "Cómo resuelven desacuerdos",
  apego: "Cercanía y espacio",
  afecto: "Cómo dan cariño",
  mbti: "Estilo para pensar",
  eneagrama: "Lo que les mueve",
  big_five: "Rasgos de personalidad",
  // Descriptive dimensions (kept for stored badges and the breakdown).
  personalidad_apertura: "Curiosidad",
  personalidad_responsabilidad: "Responsabilidad",
  personalidad_extraversion: "Energía social",
  personalidad_amabilidad: "Amabilidad",
  personalidad_estabilidad_emocional: "Calma emocional",
  mbti_extraversion: "Extraversión",
  mbti_intuicion: "Intuición",
  mbti_pensamiento: "Pensamiento",
  mbti_juicio: "Estructura",
  identidad_exclusividad: "Exclusividad",
  identidad_comunicacion_afectiva: "Comunicación afectiva",
  cultural_musica_exploracion: "Música",
  cultural_estetica_visual: "Estética",
  cultural_hobbies_creativos: "Creatividad",
  cultural_vida_universitaria: "Vida universitaria",
  cultural_humor: "Humor",
  intimidad_palabras_afirmacion: "Palabras de afirmación",
  intimidad_tiempo_calidad: "Tiempo de calidad",
  intimidad_regalos_detalle: "Detalles",
  intimidad_contacto_fisico: "Contacto físico",
  intimidad_actos_servicio: "Actos de servicio",
  intimidad_apertura_emocional: "Apertura emocional",
  intimidad_comunicacion_deseos: "Comunicación de deseos",
  intimidad_limites_respeto: "Límites y respeto",
  valores_empatia: "Empatía",
  valores_confianza: "Confianza",
  valores_gestion_conflicto: "Gestión de conflicto",
  valores_igualdad_genero: "Igualdad de género",
  valores_corresponsabilidad: "Corresponsabilidad",
  valores_respeto_diversidad: "Respeto a la diversidad",
};

/** Icon key per match category (exact id). */
const CATEGORY_ICON_KEY: Record<string, string> = {
  personalidad: "personalidad",
  big_five: "personalidad",
  mbti: "personalidad",
  eneagrama: "personalidad",
  valores: "valores_relacionales",
  dealbreakers: "valores_relacionales",
  relacional: "identidad",
  conflicto: "valores_relacionales",
  apego: "intimidad_afecto",
  afecto: "intimidad_afecto",
  estilo: "afinidad_cultural",
};

const CATEGORY_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["personalidad_", "personalidad"],
  ["mbti_", "personalidad"],
  ["identidad_", "identidad"],
  ["cultural_", "afinidad_cultural"],
  ["intimidad_", "intimidad_afecto"],
  ["valores_", "valores_relacionales"],
];

function categoryOf(dimension: string): string {
  return (
    CATEGORY_ICON_KEY[dimension] ??
    CATEGORY_BY_PREFIX.find(([prefix]) => dimension.startsWith(prefix))?.[1] ??
    "general"
  );
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const optionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function badgeForDimension(dimension: string, affinity: number): CompatibilityBadge {
  return {
    dimension,
    label: DIMENSION_LABELS[dimension] ?? dimension.replaceAll("_", " "),
    affinity,
    icon: categoryOf(dimension),
  };
}

function parseBadges(raw: unknown): CompatibilityBadge[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) =>
    isRecord(b) && typeof b.dimension === "string" && typeof b.affinity === "number"
      ? [badgeForDimension(b.dimension, b.affinity)]
      : [],
  );
}

function parseChemistry(raw: unknown): ChemistrySummary | null {
  if (!isRecord(raw)) return null;
  const { percentage, displayText, levelLabel, threshold } = raw;
  if (typeof percentage !== "number" || typeof displayText !== "string") return null;
  if (typeof levelLabel !== "string" || typeof threshold !== "number") return null;
  return raw as unknown as ChemistrySummary;
}

function isContribution(raw: unknown): boolean {
  return (
    isRecord(raw) &&
    typeof raw.category === "string" &&
    typeof raw.label === "string" &&
    typeof raw.percentage === "number" &&
    typeof raw.points === "number" &&
    typeof raw.phrase === "string"
  );
}

function isTalk(raw: unknown): boolean {
  return isRecord(raw) && typeof raw.points === "number" && typeof raw.intro === "string" && Array.isArray(raw.lines) && raw.lines.every((l) => typeof l === "string");
}

function isConfidence(raw: unknown): boolean {
  return isRecord(raw) && (raw.level === "alta" || raw.level === "media") && typeof raw.label === "string" && typeof raw.reason === "string";
}

/** Accepts an explanation only when every part the UI renders is well-formed. */
function parseExplanation(raw: unknown): MatchExplanation | null {
  if (!isRecord(raw) || !parseChemistry(raw.chemistry) || typeof raw.headline !== "string") return null;
  if (!Array.isArray(raw.connects) || !raw.connects.every(isContribution)) return null;
  if (typeof raw.otherPoints !== "number" || !isTalk(raw.talk) || !isConfidence(raw.confidence)) return null;
  if (raw.tension !== null && !(isRecord(raw.tension) && typeof raw.tension.text === "string" && typeof raw.tension.title === "string")) return null;
  return raw as unknown as MatchExplanation;
}

function parseMatchEntry(raw: unknown): ResultMatch | null {
  if (!isRecord(raw) || typeof raw.alias !== "string" || typeof raw.similarity !== "number") {
    return null;
  }
  const explanation = parseExplanation(raw.explanation);
  return {
    id: optionalString(raw.id),
    alias: raw.alias,
    animal: optionalString(raw.animal) ?? "",
    animal_id: optionalString(raw.animal_id),
    color: optionalString(raw.color) ?? "",
    color_id: optionalString(raw.color_id),
    color_hex: optionalString(raw.color_hex),
    mark: parseMark(raw.mark),
    mbti_code: optionalString(raw.mbti_code),
    similarity: raw.similarity,
    chemistry: parseChemistry(raw.chemistry) ?? explanation?.chemistry ?? null,
    badges: parseBadges(raw.badges),
    narrative: optionalString(raw.narrative) ?? "",
    explanation,
    layers: parseLayers(raw.layers),
    shared: parseShared(raw.shared),
  };
}

function parseMark(raw: unknown): SpriteMark | null {
  return raw === "sp" || raw === "so" || raw === "sx" ? raw : null;
}

function parseMatchList(raw: unknown): ResultMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseMatchEntry).filter((m): m is ResultMatch => m !== null);
}

/** Supabase embedded joins may arrive as an object or a one-element array. */
function firstRecord(raw: unknown): Record<string, unknown> | null {
  const value: unknown = Array.isArray(raw) ? raw[0] : raw;
  return isRecord(value) ? value : null;
}

function parseAnimal(raw: unknown): PublicResult["animal"] | null {
  const animal = firstRecord(raw);
  if (!animal || typeof animal.id !== "string" || typeof animal.diminutivo_es !== "string") {
    return null;
  }
  return {
    id: animal.id,
    diminutivo_es: animal.diminutivo_es,
    categoria_fauna: optionalString(animal.categoria_fauna) ?? "",
  };
}

function parseColor(raw: unknown): PublicResult["color"] | null {
  const color = firstRecord(raw);
  if (!color || typeof color.id !== "string" || typeof color.nombre !== "string") return null;
  if (typeof color.hex !== "string" || !HEX_PATTERN.test(color.hex)) return null;
  return { id: color.id, nombre: color.nombre, hex: color.hex };
}

export function parsePublicResult(raw: unknown): PublicResult | null {
  if (!isRecord(raw) || typeof raw.alias !== "string" || typeof raw.narrative !== "string") {
    return null;
  }
  const animal = parseAnimal(raw.animal);
  const color = parseColor(raw.color);
  if (!animal || !color || !isRecord(raw.matches)) return null;

  return {
    alias: raw.alias,
    animal,
    color,
    mark: parseMark(raw.mark),
    narrative: raw.narrative,
    mbti_code: optionalString(raw.mbti_code),
    matches: {
      romance: parseMatchList(raw.matches.romance),
      amistad: parseMatchList(raw.matches.amistad),
    },
    fewPeople: raw.few_people === true,
    no_match_message: optionalString(raw.no_match_message) ?? NO_MATCH_MESSAGE,
  };
}
