import { z } from "zod";

import raw from "../../data/admin-config.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;
const MAX_PAGE = 200;

/**
 * Admin console (ADR-036): matrícula + admin PIN, a short signed session,
 * growing pauses per account and a per-address guard. Page sizes bound every
 * listing so one request never dumps the whole table.
 */
export const adminConfigSchema = z
  .strictObject({
    version: z.string().min(1),
    pin: z.strictObject({ length: z.number().int().min(MIN_PIN_LENGTH).max(MAX_PIN_LENGTH) }),
    attempts: z.strictObject({
      perStep: positiveInt,
      waitMinutes: z.array(positiveInt).min(1),
    }),
    session: z.strictObject({ idleMinutes: positiveInt, maxMinutes: positiveInt }),
    addressGuard: z.strictObject({ limit: positiveInt, windowSeconds: positiveInt, lockSeconds: positiveInt }),
    users: z.strictObject({ pageSize: positiveInt.max(MAX_PAGE), searchMaxChars: positiveInt }),
    /**
     * Time windows the observatory offers. A request outside this list falls
     * back to `defaultWindowDays` instead of reaching the database, so the
     * `?days=` of a hand-typed URL never becomes an unbounded scan.
     */
    metrics: z.strictObject({
      windowsDays: z.array(positiveInt.min(1).max(120)).min(1).max(4),
      defaultWindowDays: positiveInt.max(120),
    }),
    reports: z.strictObject({ pageSize: positiveInt.max(MAX_PAGE) }),
    audit: z.strictObject({ pageSize: positiveInt.max(MAX_PAGE) }),
  })
  .refine((c) => c.session.idleMinutes <= c.session.maxMinutes, {
    message: "session.idleMinutes must not exceed session.maxMinutes",
  })
  .refine((c) => c.metrics.windowsDays.includes(c.metrics.defaultWindowDays), {
    message: "metrics.defaultWindowDays must be one of metrics.windowsDays",
  });

export type AdminConfig = z.output<typeof adminConfigSchema>;

export const ADMIN_CONFIG = loadConfig("admin-config", adminConfigSchema, raw);
