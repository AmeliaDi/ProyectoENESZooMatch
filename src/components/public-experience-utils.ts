import type { MatchExplanation } from "@/lib/matching/explainability";
import { NO_MATCH_MESSAGE } from "@/lib/notification-copy";
import type { CompatibilityBadge } from "@/types/microtest";

// ─── Matrícula helpers ────────────────────────────────────────────────────────

export function normalizePublicMatricula(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export function isPublicMatriculaValid(value: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(normalizePublicMatricula(value));
}

// ─── Storage key ──────────────────────────────────────────────────────────────

export const QUIZ_STORAGE_KEY = "zoomatch:quiz-draft";

// ─── No-match message ─────────────────────────────────────────────────────────

export { NO_MATCH_MESSAGE };

// ─── Draft types ──────────────────────────────────────────────────────────────

export type QuizDraft = {
  likert: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>;
  filters: Partial<Record<string, string[]>>;
};

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ResultMatch {
  /**
   * Opaque counterpart user id (React key for the constellation). Optional and
   * never displayed; carries no matrícula, hash, answer or vector data.
   */
  id?: string | null;
  alias: string;
  animal: string;
  /** Catalogue animal id resolved server-side (optional; constellation adapter). */
  animal_id?: string | null;
  color: string;
  /** Catalogue color id resolved server-side (optional; constellation adapter). */
  color_id?: string | null;
  /** Catalogue color hex resolved server-side (optional; constellation adapter). */
  color_hex?: string | null;
  /** Counterpart MBTI code (optional; constellation adapter). */
  mbti_code?: string | null;
  similarity: number;
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
  matches: {
    romance: ResultMatch[];
    amistad: ResultMatch[];
  };
  no_match_message: string;
}

// ─── Category display names ───────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  personalidad_bigfive: "Tu personalidad",
  personalidad_mbti: "Tu forma de pensar",
  identidad_filtros: "Tu identidad y lo que buscas",
  afinidad_cultural: "Tus gustos y pasiones",
  intimidad_afecto: "Tu forma de amar",
  valores_relacionales: "Tus valores",
};

// ─── Likert scale labels (1–5) ────────────────────────────────────────────────

export const LIKERT_LABELS = [
  "Totalmente en desacuerdo",
  "En desacuerdo",
  "Neutral",
  "De acuerdo",
  "Totalmente de acuerdo",
];

// ─── Dimension → badge icon + label map ───────────────────────────────────────

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

export function badgeForDimension(dimension: string, affinity: number): CompatibilityBadge {
  const entry = DIMENSION_BADGE_MAP[dimension];
  return {
    dimension,
    label: entry?.label ?? dimension.replaceAll("_", " "),
    affinity,
    icon: entry?.icon ?? "✨",
  };
}

// ─── Draft persistence helpers ────────────────────────────────────────────────

export function parseQuizDraft(raw: string | null): QuizDraft {
  const empty: QuizDraft = { likert: {}, filters: {} };
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const record = parsed as Record<string, unknown>;

    const likert: QuizDraft["likert"] = {};
    if (record.likert && typeof record.likert === "object" && !Array.isArray(record.likert)) {
      for (const [key, value] of Object.entries(record.likert as Record<string, unknown>)) {
        if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
          likert[key] = value;
        }
      }
    }

    const filters: QuizDraft["filters"] = {};
    if (record.filters && typeof record.filters === "object" && !Array.isArray(record.filters)) {
      for (const [key, value] of Object.entries(record.filters as Record<string, unknown>)) {
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
          filters[key] = value as string[];
        }
      }
    }

    return { likert, filters };
  } catch {
    return empty;
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatPercentage(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

// ─── Result parser ────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBadgeArray(raw: unknown): CompatibilityBadge[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((b) => typeof b.dimension === "string" && typeof b.affinity === "number")
    .map((b) => badgeForDimension(b.dimension as string, b.affinity as number));
}

function parseMatchEntry(raw: unknown): ResultMatch | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.alias !== "string") return null;
  if (typeof raw.similarity !== "number") return null;
  const entry: ResultMatch = {
    alias: raw.alias,
    animal: typeof raw.animal === "string" ? raw.animal : "",
    color: typeof raw.color === "string" ? raw.color : "",
    similarity: raw.similarity,
    badges: parseBadgeArray(raw.badges),
    narrative: typeof raw.narrative === "string" ? raw.narrative : "",
    explanation: isRecord(raw.explanation) ? (raw.explanation as unknown as MatchExplanation) : null,
  };
  // Additive, optional identity fields consumed by the constellation adapter.
  // Only present when the server supplied a usable string, so older payloads and
  // the existing parser contract stay untouched.
  if (typeof raw.id === "string") entry.id = raw.id;
  if (typeof raw.animal_id === "string") entry.animal_id = raw.animal_id;
  if (typeof raw.color_id === "string") entry.color_id = raw.color_id;
  if (typeof raw.color_hex === "string") entry.color_hex = raw.color_hex;
  if (typeof raw.mbti_code === "string") entry.mbti_code = raw.mbti_code;
  return entry;
}

function parseMatchList(raw: unknown): ResultMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseMatchEntry).filter((m): m is ResultMatch => m !== null);
}

export function parsePublicResult(raw: unknown): PublicResult | null {
  if (!isRecord(raw)) return null;

  // alias
  if (typeof raw.alias !== "string") return null;

  // animal — Supabase joins may return a single object or a one-element array
  const rawAnimal = Array.isArray(raw.animal) ? raw.animal[0] : raw.animal;
  if (!isRecord(rawAnimal)) return null;
  if (typeof rawAnimal.id !== "string" || typeof rawAnimal.diminutivo_es !== "string") return null;

  // color — same array-or-object handling
  const rawColor = Array.isArray(raw.color) ? raw.color[0] : raw.color;
  if (!isRecord(rawColor)) return null;
  if (typeof rawColor.id !== "string" || typeof rawColor.nombre !== "string") return null;
  if (typeof rawColor.hex !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(rawColor.hex)) return null;

  // narrative
  if (typeof raw.narrative !== "string") return null;

  // mbti_code (nullable)
  const mbtiCode = raw.mbti_code === null || typeof raw.mbti_code === "string" ? raw.mbti_code : null;

  // matches
  const matches = raw.matches;
  if (!isRecord(matches)) return null;

  const romance = parseMatchList(matches.romance);
  const amistad = parseMatchList(matches.amistad);

  return {
    alias: raw.alias,
    animal: {
      id: rawAnimal.id,
      diminutivo_es: rawAnimal.diminutivo_es,
      categoria_fauna: typeof rawAnimal.categoria_fauna === "string" ? rawAnimal.categoria_fauna : "",
    },
    color: { id: rawColor.id, nombre: rawColor.nombre, hex: rawColor.hex },
    narrative: raw.narrative,
    mbti_code: mbtiCode,
    matches: { romance, amistad },
    no_match_message:
      typeof raw.no_match_message === "string" ? raw.no_match_message : NO_MATCH_MESSAGE,
  };
}
