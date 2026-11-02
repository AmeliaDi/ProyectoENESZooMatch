import { z } from "zod";

import { QUIZ_MODULE_IDS, type QuizModuleId } from "@/types/microtest";

import raw from "../../data/experience.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();

const OPTIONAL_MODULES = QUIZ_MODULE_IDS.filter((id) => id !== "nucleo") as [QuizModuleId, ...QuizModuleId[]];
/** A permutation of every optional module. */
const moduleOrder = z
  .array(z.enum(OPTIONAL_MODULES))
  .refine((order) => new Set(order).size === OPTIONAL_MODULES.length && order.length === OPTIONAL_MODULES.length, "every optional module exactly once");

/**
 * Pacing and presentation parameters of the public flow (quiz, reveal,
 * result, notifications). Kept out of components so nothing is a magic number.
 */
export const experienceSchema = z.strictObject({
  version: z.string().min(1),
  /** Entry scene: seeded stars lighting up in order, yours last. */
  dawn: z.strictObject({
    gridWidth: positiveInt,
    gridHeight: positiveInt,
    stars: z.number().int().min(2).max(64),
    seed: z.number().int(),
    stepMs: positiveInt,
    sparkleArm: z.number().int().min(1).max(4),
  }),
  onboarding: z.strictObject({ storageKey: z.string().min(1) }),
  quiz: z.strictObject({
    /** Used only to tell people roughly how long the test takes. */
    secondsPerItem: positiveInt,
    /** Every N answered items the progress line offers a short pause note. */
    breathEvery: positiveInt,
    /** Option that deselects every other option of a multi-select item. */
    exclusiveOption: z.string().min(1),
    /** Categories shown last, after a short note about why they are asked. */
    sensitiveCategories: z.array(z.string().min(1)),
  }),
  reveal: z.strictObject({
    /** Delay between two sprite cells uncovering in the reveal sequence. */
    cellStepMs: positiveInt,
    seed: z.number().int(),
  }),
  /**
   * "¿Quieres afinar tu perfil?": suggested module order per track. Friendship
   * starts with interests (ADR-020: with only the core, friendship ρ = 0.785).
   */
  refine: z.strictObject({
    draftKey: z.string().min(1),
    order: z.strictObject({ amistad: moduleOrder, romance: moduleOrder }),
  }),
  result: z.strictObject({
    /** Floor for the loading state so it never flashes. */
    minimumLoadingMs: z.number().int().nonnegative(),
    timeoutMs: positiveInt,
    /** Below this many active profiles the empty state says "somos pocxs". */
    fewPeopleThreshold: positiveInt,
    /** Areas listed under "lo que más conecta" (the rest are summed). */
    detailBreakdownMax: positiveInt,
  }),
  notifications: z.strictObject({
    pollMs: z.number().int().min(5000),
    maxVisible: positiveInt,
  }),
  admin: z.strictObject({
    pollMs: z.number().int().min(10000),
    /** Aggregated cells below k are suppressed (k-anonymity floor). */
    kAnonymity: z.number().int().min(2),
  }),
});

export type Experience = z.output<typeof experienceSchema>;

export const EXPERIENCE: Readonly<Experience> = loadConfig("experience", experienceSchema, raw);
