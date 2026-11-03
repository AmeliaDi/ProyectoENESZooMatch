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
 * Entry hardening (ADR-023): the matrícula only identifies, the personal key
 * authenticates, and a Postgres-backed guard throttles guessing per network
 * address and per account. Campus Wi-Fi shares one public address among many
 * students, so address limits are generous and account limits are tight.
 */
export const accessConfigSchema = z.strictObject({
  version: z.string().min(1),
  matricula: z.strictObject({ digits: z.number().int().min(6).max(12) }),
  accessKey: z
    .strictObject({ minLength: z.number().int().min(6), maxLength: z.number().int().max(128) })
    .refine((k) => k.minLength < k.maxLength, "minLength must be below maxLength"),
  guard: z.strictObject({
    attemptsPerAddress: guardRule,
    failuresPerAddress: guardRule,
    failuresPerAccount: guardRule,
  }),
});

export type AccessConfig = z.output<typeof accessConfigSchema>;

export const ACCESS_CONFIG = loadConfig("access-config", accessConfigSchema, raw);
