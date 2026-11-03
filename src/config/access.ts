import { z } from "zod";

import raw from "../../data/access-config.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();

const guardRule = z.strictObject({
  /** Hits allowed inside one window; the next one locks the subject. */
  limit: positiveInt,
  windowSeconds: positiveInt,
  lockSeconds: positiveInt,
});

/**
 * Entry rules (ADR-023, ADR-026): the matrícula (número de cuenta UNAM) is the
 * only credential and must be exactly N digits; a Postgres-backed guard
 * throttles entry attempts per network address. Campus Wi-Fi shares one public
 * address among many students, so the limit is generous.
 */
export const accessConfigSchema = z.strictObject({
  version: z.string().min(1),
  matricula: z.strictObject({ digits: z.number().int().min(6).max(12) }),
  guard: z.strictObject({
    attemptsPerAddress: guardRule,
  }),
});

export type AccessConfig = z.output<typeof accessConfigSchema>;

export const ACCESS_CONFIG = loadConfig("access-config", accessConfigSchema, raw);
