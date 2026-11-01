import { z } from "zod";

import raw from "../../data/experience.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();

/**
 * Pacing and presentation parameters of the public flow (quiz, reveal,
 * result, notifications). Kept out of components so nothing is a magic number.
 */
export const experienceSchema = z.strictObject({
  version: z.string().min(1),
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
  result: z.strictObject({
    /** Floor for the loading state so it never flashes. */
    minimumLoadingMs: z.number().int().nonnegative(),
    timeoutMs: positiveInt,
    /** Below this many active profiles the empty state says "somos pocxs". */
    fewPeopleThreshold: positiveInt,
    detailBreakdownMax: positiveInt,
  }),
  notifications: z.strictObject({
    pollMs: z.number().int().min(5000),
    maxVisible: positiveInt,
  }),
});

export type Experience = z.output<typeof experienceSchema>;

export const EXPERIENCE: Readonly<Experience> = loadConfig("experience", experienceSchema, raw);
