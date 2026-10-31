/**
 * Client-side parser for `GET /api/result`. It never trusts the payload:
 * malformed entries are dropped, badge labels/icons come from a local map,
 * and a missing chemistry summary is derived from the similarity percentage.
 */
import type { ChemistrySummary, MatchExplanation } from "@/contracts/result";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import type { CompatibilityBadge } from "@/types/microtest";

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
  mbti_code?: string | null;
  similarity: number;
  chemistry: ChemistrySummary | null;
  badges: CompatibilityBadge[];
  narrative: string;
  explanation: MatchExplanation | null;
}

export interface PublicResult {
  alias: string;
  animal: { id: string; diminutivo_es: string; categoria_fauna: string };
  color: { id: string; nombre: string; hex: string };
  narrative: string;
  mbti_code: string | null;
  matches: { romance: ResultMatch[]; amistad: ResultMatch[] };
  no_match_message: string;
}

const DIMENSION_BADGE_MAP: Record<string, { icon: string; label: string }> = {
  personalidad_apertura: { icon: "🌱", label: "Curiosidad" },
  personalidad_responsabilidad: { icon: "⚓", label: "Responsabilidad" },
  personalidad_extraversion: { icon: "⚡", label: "Energía social" },
  personalidad_amabilidad: { icon: "🤝", label: "Amabilidad" },
  personalidad_estabilidad_emocional: { icon: "🌊", label: "Calma emocional" },
  mbti_extraversion: { icon: "🔆", label: "Extraversión" },
  mbti_intuicion: { icon: "🔮", label: "Intuición" },
  mbti_pensamiento: { icon: "🧠", label: "Pensamiento" },
  mbti_juicio: { icon: "📐", label: "Estructura" },
  identidad_exclusividad: { icon: "💫", label: "Exclusividad" },
  identidad_comunicacion_afectiva: { icon: "💬", label: "Comunicación afectiva" },
  cultural_musica_exploracion: { icon: "🎵", label: "Música" },
  cultural_estetica_visual: { icon: "🎨", label: "Estética" },
  cultural_hobbies_creativos: { icon: "✂️", label: "Creatividad" },
  cultural_vida_universitaria: { icon: "🎓", label: "Vida universitaria" },
  cultural_humor: { icon: "😄", label: "Humor" },
  intimidad_palabras_afirmacion: { icon: "💌", label: "Palabras de afirmación" },
  intimidad_tiempo_calidad: { icon: "⏳", label: "Tiempo de calidad" },
  intimidad_regalos_detalle: { icon: "🎁", label: "Detalles" },
  intimidad_contacto_fisico: { icon: "🫂", label: "Contacto físico" },
  intimidad_actos_servicio: { icon: "🛠️", label: "Actos de servicio" },
  intimidad_apertura_emocional: { icon: "🫀", label: "Apertura emocional" },
  intimidad_comunicacion_deseos: { icon: "🗣️", label: "Comunicación de deseos" },
  intimidad_limites_respeto: { icon: "🚧", label: "Límites y respeto" },
  valores_empatia: { icon: "💜", label: "Empatía" },
  valores_confianza: { icon: "🔐", label: "Confianza" },
  valores_gestion_conflicto: { icon: "🕊️", label: "Gestión de conflicto" },
  valores_igualdad_genero: { icon: "⚖️", label: "Igualdad de género" },
  valores_corresponsabilidad: { icon: "🤲", label: "Corresponsabilidad" },
  valores_respeto_diversidad: { icon: "🌈", label: "Respeto a la diversidad" },
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const optionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function badgeForDimension(dimension: string, affinity: number): CompatibilityBadge {
  const entry = DIMENSION_BADGE_MAP[dimension];
  return {
    dimension,
    label: entry?.label ?? dimension.replaceAll("_", " "),
    affinity,
    icon: entry?.icon ?? "✨",
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

/** Accepts an explanation only when the parts the UI renders are present. */
function parseExplanation(raw: unknown): MatchExplanation | null {
  if (!isRecord(raw)) return null;
  if (!parseChemistry(raw.chemistry) || !Array.isArray(raw.breakdown)) return null;
  if (typeof raw.headline !== "string") return null;
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
    mbti_code: optionalString(raw.mbti_code),
    similarity: raw.similarity,
    chemistry: parseChemistry(raw.chemistry) ?? explanation?.chemistry ?? null,
    badges: parseBadges(raw.badges),
    narrative: optionalString(raw.narrative) ?? "",
    explanation,
  };
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
    narrative: raw.narrative,
    mbti_code: optionalString(raw.mbti_code),
    matches: {
      romance: parseMatchList(raw.matches.romance),
      amistad: parseMatchList(raw.matches.amistad),
    },
    no_match_message: optionalString(raw.no_match_message) ?? NO_MATCH_MESSAGE,
  };
}
