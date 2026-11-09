/**
 * Wire contract of `/api/quiz/retake` (B9.2, ADR-054).
 *
 * It carries the plan already narrowed to this person, as renderable questions:
 * text, control kind, option ids and whether the question can be skipped. Never
 * θ, never the answers that stay stored, never anything about other people.
 */
import type { RetakeLevel } from "@/domain/psychometrics/minimal-retake";

export interface RetakeItemDto {
  readonly id: string;
  readonly texto: string;
  readonly tipo: "likert" | "filtro";
  /** Option ids for a `filtro`; `null` when the answer is a Likert gem. */
  readonly opciones: readonly string[] | null;
  /** Offers "Prefiero no decir"; skipping retires the stored answer. */
  readonly sensible: boolean;
}

export interface RetakeBlockDto {
  readonly factor: string;
  readonly items: readonly RetakeItemDto[];
}

export type RetakeViewDto =
  | {
      readonly status: "plan";
      readonly level: RetakeLevel;
      readonly blocks: readonly RetakeBlockDto[];
      readonly total: number;
      readonly retired: number;
    }
  | { readonly status: "current" }
  | { readonly status: "unstamped" }
  | { readonly status: "unknown" }
  | { readonly status: "capped"; readonly total: number };
