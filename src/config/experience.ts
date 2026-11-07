import { z } from "zod";

import { QUIZ_MODULE_IDS, type QuizModuleId } from "@/types/microtest";

import raw from "../../data/experience.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();

/** Lengths on the 2 px logical-pixel grid (docs/DISENO.md §7.3). */
const gridPx = positiveInt.refine((n) => n % 2 === 0, "multiple of the 2 px logical pixel");

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
    /**
     * Silent re-read when the tab becomes visible again, at most this often,
     * so a layer someone stops sharing disappears without a reload (ADR-034).
     */
    refreshOnReturnMs: z.number().int().min(5000),
    /** Below this many active profiles the empty state says "somos pocxs". */
    fewPeopleThreshold: positiveInt,
    /** Areas listed under "lo que más conecta" (the rest are summed). */
    detailBreakdownMax: positiveInt,
    /**
     * Shown (rounded) percent from which a match turns golden, per track
     * (ADR-031): near the p99 of real affinities, so gold stays rare but
     * reachable. Re-derive with the distribution query when the pool grows.
     */
    radiantPercent: z.strictObject({
      romance: z.number().int().min(1).max(100),
      amistad: z.number().int().min(1).max(100),
    }),
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
  /**
   * Quick guide over the constellation (first visit to /resultado). The key is
   * versioned: bump it when the steps change so everybody sees the new guide.
   */
  coachmarks: z.strictObject({
    storageKey: z.string().regex(/:v\d+$/, "versioned key, e.g. zoomatch:coachmarks:v1"),
    /** Up to this viewport width the guide uses the mobile card even with a fine pointer. */
    mobileMaxWidthPx: positiveInt,
    /** Wait for the sky to settle before the first step appears. */
    openDelayMs: z.number().int().nonnegative(),
    /** How often the highlight re-measures its target (the canvas can scroll or resize). */
    trackMs: z.number().int().min(100),
    /** One loop of the pixel finger drag and its number of discrete frames. */
    dragLoopMs: positiveInt,
    dragSteps: z.number().int().min(2).max(12),
    /** Breathing room between the highlighted element and the gold halo. */
    highlightPadPx: gridPx,
    /** Side of the square highlighted at the canvas centre when your node is not found. */
    selfFallbackPx: gridPx,
  }),
  /** Illustrated 404: the lost little animal and its discreet easter egg. */
  notFound: z.strictObject({
    animalId: z.string().min(1),
    colorId: z.string().min(1),
    artPx: gridPx,
    /** Taps on the lost animal before it says hello. */
    easterEggTaps: z.number().int().min(3).max(12),
  }),
});

export type Experience = z.output<typeof experienceSchema>;

export const EXPERIENCE: Readonly<Experience> = loadConfig("experience", experienceSchema, raw);
