/**
 * Wire contract of `GET /api/profile` ("Tu carta"). Owner-only and derived:
 * never θ, SE, vectors, answers, filters or anything about other people
 * beyond the aliases already visible in the result.
 */
import type { IdentityDto } from "./identity";

export type ReadingConfidenceDto = "clara" | "tentativa" | "abierta";
export type ReadingLeaningDto = "bajo" | "medio" | "alto";

export interface ScaleReadingDto {
  key: string;
  label: string;
  low: string;
  high: string;
  /** Estimated population position Φ(θ̂) ∈ [0, 1], 2 decimals. */
  position: number;
  /** One everyday line (HEXACO hexagon); optional. */
  hint?: string;
  /** Faint band Φ(θ̂ ± z·SE). */
  range: [number, number];
  confidence: ReadingConfidenceDto;
  leaning: ReadingLeaningDto;
}

export interface SectionReadingDto {
  id: string;
  title: string;
  blurb: string;
  scales: ScaleReadingDto[];
}

export interface AffinitySummaryDto {
  /** Counterpart identity, already filtered by their sharing choices. */
  identity: IdentityDto;
  /** Rounded estimated affinity in %. */
  percent: number;
}

export interface ProfileDto {
  /** Stored identity of the owner; the only source of the displayed name. */
  identity: IdentityDto;
  narrative: string;
  mbti: { code: string; balancedAxes: number };
  enneagram: { code: string; name: string; archetype: string; exploring: boolean };
  virtues: Array<{ title: string; text: string }>;
  sections: SectionReadingDto[];
  /** How many scales are still at the population prior (unanswered modules). */
  openScales: { open: number; total: number };
  /** Optional modules already completed (ids only; never the answers). */
  completedModules: string[];
  /**
   * Sellado de medición del perfil guardado (B9). `stamped: false` = anterior al
   * sello; `current: false` con sello = hay una afinación pendiente, opcional.
   */
  measurement: { stamped: boolean; current: boolean; seal: string };
  affinities: {
    romance: { count: number; top: AffinitySummaryDto[] };
    amistad: { count: number; top: AffinitySummaryDto[] };
  };
  /**
   * Ids de `data/badges.json` ya desbloqueados, derivados de filas que la app
   * guarda (M-14). `null` = la lectura falló hoy y la sección no se muestra;
   * contaría cero como si la persona no hubiera hecho nada, y eso no se afirma.
   *
   * Solo viajan ids: los nombres y las frases los pone el catálogo en el
   * cliente, que es el texto revisado por las pruebas de copy. `badges` no es
   * nombre posible: en `matches` esa columna son los chips de compatibilidad.
   */
  unlockedBadges: string[] | null;
}
