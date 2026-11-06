/**
 * Client-side parser for `GET /api/result`. It never trusts the payload:
 * malformed entries are dropped, badge labels come from a local map and the
 * badge icon is the dimension's category key (rendered as a pixel icon).
 * Identity — own and counterpart — is read only through `parseIdentity`, so
 * this file carries no second name route, and an egg never reaches a screen.
 */
import type {
  ChemistrySummary,
  MatchEntryDto,
  MatchExplanation,
  ResultDto,
} from "@/contracts/result";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { isHatched, parseIdentity } from "@/ui/shared/parse-identity";
import type { CompatibilityBadge } from "@/types/microtest";

import { parseLayers, parseShared } from "./parse-shared";

export { NO_MATCH_MESSAGE };

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

/**
 * The only badge wording route: labels and icon keys always come from the local
 * maps, never from the payload. Exported because the constellation's node
 * contract wants the same enriched badges the parser produced.
 */
export function normalizeBadges(
  badges: readonly { dimension: string; affinity: number }[],
): CompatibilityBadge[] {
  return badges.map((badge) => badgeForDimension(badge.dimension, badge.affinity));
}

function parseBadges(raw: unknown): CompatibilityBadge[] {
  if (!Array.isArray(raw)) return [];
  return normalizeBadges(
    raw.filter(
      (b): b is { dimension: string; affinity: number } =>
        isRecord(b) && typeof b.dimension === "string" && typeof b.affinity === "number",
    ),
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

function parseMatchEntry(raw: unknown): MatchEntryDto | null {
  if (!isRecord(raw) || typeof raw.similarity !== "number") return null;
  const identity = parseIdentity(raw.identity);
  // Fail closed: an egg or an unusable identity never becomes a card or a star.
  if (!isHatched(identity)) return null;
  const explanation = parseExplanation(raw.explanation);
  // `MatchEntryDto.chemistry` is never nullable: the server always computes it,
  // so an entry without any usable band is a broken row and gets dropped.
  const chemistry = parseChemistry(raw.chemistry) ?? explanation?.chemistry;
  if (!chemistry) return null;
  return {
    id: optionalString(raw.id),
    identity,
    similarity: raw.similarity,
    chemistry,
    badges: parseBadges(raw.badges),
    explanation,
    layers: parseLayers(raw.layers),
    shared: parseShared(raw.shared),
  };
}

function parseMatchList(raw: unknown): MatchEntryDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseMatchEntry).filter((m): m is MatchEntryDto => m !== null);
}

export function parsePublicResult(raw: unknown): ResultDto | null {
  if (!isRecord(raw) || typeof raw.narrative !== "string" || !isRecord(raw.matches)) {
    return null;
  }
  const identity = parseIdentity(raw.identity);
  if (!isHatched(identity)) return null;

  return {
    identity,
    narrative: raw.narrative,
    matches: {
      romance: parseMatchList(raw.matches.romance),
      amistad: parseMatchList(raw.matches.amistad),
    },
    few_people: raw.few_people === true,
    no_match_message: optionalString(raw.no_match_message) ?? NO_MATCH_MESSAGE,
  };
}
