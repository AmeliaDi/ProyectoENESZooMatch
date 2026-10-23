import { QUIZ_ITEM_IDS, type LikertValue, type QuizItemId } from "@/types/microtest";

export const QUIZ_STORAGE_KEY = "zoomatch:quiz-draft:v1";
export const NO_MATCH_LITERAL = "aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor \u003c3";

export type QuizDraft = Partial<Record<QuizItemId, LikertValue>>;

export interface ResultArchetype {
  id: string;
  mbti_code: string;
  nickname: string;
  role_name: string;
  traits: string[];
  animal: {
    nombre_fuente?: string;
    diminutivo_es?: string;
  };
  palette: Array<{ nombre: string; hex: string }>;
  primary_color: { nombre: string; hex: string };
  readable_combination: string;
}

export interface MatchResult {
  alias: string;
  similarity: number;
  justification: Array<{ dimension: string; affinity: number }>;
}

export interface PublicResult {
  alias: string;
  archetype: ResultArchetype;
  matches: MatchResult[];
}

export function normalizePublicMatricula(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export function isPublicMatriculaValid(value: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(normalizePublicMatricula(value));
}

export function parseQuizDraft(value: string | null): QuizDraft {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const allowedIds = new Set<string>(QUIZ_ITEM_IDS);
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([itemId, answer]) =>
          allowedIds.has(itemId) &&
          (answer === 1 || answer === 2 || answer === 3 || answer === 4),
      ),
    ) as QuizDraft;
  } catch {
    return {};
  }
}

export function answeredIndex(draft: QuizDraft): number {
  const firstMissing = QUIZ_ITEM_IDS.findIndex((itemId) => draft[itemId] === undefined);
  return firstMissing === -1 ? QUIZ_ITEM_IDS.length - 1 : firstMissing;
}

export function formatPercentage(value: number): string {
  const bounded = Math.min(1, Math.max(0, value));
  return `${Math.round(bounded * 100)}%`;
}

const dimensionLabels: Record<string, string> = {
  bigfive_apertura: "curiosidad",
  bigfive_responsabilidad: "responsabilidad",
  bigfive_extraversion: "energía social",
  bigfive_amabilidad: "amabilidad",
  bigfive_neuroticismo: "sensibilidad emocional",
  relaciones_comunicacion: "comunicación",
  relaciones_confianza: "confianza",
  relaciones_empatia: "empatía",
  relaciones_gestion_conflicto: "acuerdos",
  genero_igualdad: "igualdad",
  genero_flexibilidad_roles: "flexibilidad",
  genero_respeto_diversidad: "respeto a la diversidad",
  genero_corresponsabilidad: "corresponsabilidad",
};

export function formatDimension(dimension: string): string {
  return dimensionLabels[dimension] ?? dimension.replaceAll("_", " ");
}

function isColor(value: unknown): value is { nombre: string; hex: string } {
  if (!value || typeof value !== "object") return false;
  const color = value as Record<string, unknown>;
  return typeof color.nombre === "string" && /^#[0-9A-F]{6}$/i.test(String(color.hex));
}

export function parsePublicResult(value: unknown): PublicResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawArchetype = Array.isArray(record.archetype) ? record.archetype[0] : record.archetype;
  if (!rawArchetype || typeof rawArchetype !== "object") return null;

  const archetype = rawArchetype as Record<string, unknown>;
  const animal = archetype.animal;
  const palette = archetype.palette;
  const matches = record.matches;
  if (
    typeof record.alias !== "string" ||
    typeof archetype.id !== "string" ||
    typeof archetype.mbti_code !== "string" ||
    typeof archetype.nickname !== "string" ||
    typeof archetype.role_name !== "string" ||
    !Array.isArray(archetype.traits) ||
    !archetype.traits.every((trait) => typeof trait === "string") ||
    !animal ||
    typeof animal !== "object" ||
    !Array.isArray(palette) ||
    !palette.every(isColor) ||
    !isColor(archetype.primary_color) ||
    typeof archetype.readable_combination !== "string" ||
    !Array.isArray(matches)
  ) {
    return null;
  }

  const parsedMatches: MatchResult[] = [];
  for (const candidate of matches) {
    if (!candidate || typeof candidate !== "object") return null;
    const match = candidate as Record<string, unknown>;
    if (
      typeof match.alias !== "string" ||
      typeof match.similarity !== "number" ||
      match.similarity < 0 ||
      match.similarity > 1 ||
      !Array.isArray(match.justification)
    ) {
      return null;
    }

    const justification = match.justification.filter(
      (item): item is { dimension: string; affinity: number } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).dimension === "string" &&
        typeof (item as Record<string, unknown>).affinity === "number",
    );
    parsedMatches.push({
      alias: match.alias,
      similarity: match.similarity,
      justification,
    });
  }

  return {
    alias: record.alias,
    archetype: {
      id: archetype.id,
      mbti_code: archetype.mbti_code,
      nickname: archetype.nickname,
      role_name: archetype.role_name,
      traits: archetype.traits as string[],
      animal: animal as ResultArchetype["animal"],
      palette: palette as ResultArchetype["palette"],
      primary_color: archetype.primary_color as ResultArchetype["primary_color"],
      readable_combination: archetype.readable_combination,
    },
    matches: parsedMatches,
  };
}
