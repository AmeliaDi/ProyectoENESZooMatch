import { z } from "zod";

import raw from "../../data/chat-config.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;
/** scrypt needs 128·N·r bytes; below N = 2^14 it is too cheap to matter. */
const MIN_LOG2N = 14;
const MAX_LOG2N = 20;

/**
 * Chat PIN lock (docs/CHAT.md, ADR-029). A light lock against someone holding
 * the device, not encryption: the pepper, the per-account pauses and the
 * address guard are what make 10 000 combinations costly to guess.
 */
export const chatConfigSchema = z
  .strictObject({
    version: z.string().min(1),
    pin: z.strictObject({
      length: z.number().int().min(MIN_PIN_LENGTH).max(MAX_PIN_LENGTH),
      blocklist: z.array(z.string().regex(/^[0-9]+$/)),
    }),
    attempts: z.strictObject({
      /** Consecutive failures allowed before each pause. */
      perStep: positiveInt,
      /** Pause per step; the last value repeats for every later step. */
      waitMinutes: z.array(positiveInt).min(1),
      /** Pauses at the longest wait after which only a reset unlocks the PIN. */
      resetOnlyAfterMaxPauses: positiveInt,
      /** Window of "intentos fallidos recientes" shown in settings. */
      recentFailureDays: positiveInt,
    }),
    lock: z.strictObject({
      idleMinutes: positiveInt,
      maxMinutes: positiveInt,
      onHidden: z.boolean(),
    }),
    recovery: z.strictObject({ waitHours: positiveInt }),
    kdf: z.strictObject({
      log2N: z.number().int().min(MIN_LOG2N).max(MAX_LOG2N),
      r: positiveInt,
      p: positiveInt,
      keyLen: positiveInt,
      saltBytes: positiveInt,
      maxmemMiB: positiveInt,
    }),
    activity: z.strictObject({ limit: positiveInt }),
    addressGuard: z.strictObject({
      limit: positiveInt,
      windowSeconds: positiveInt,
      lockSeconds: positiveInt,
    }),
  })
  .refine((c) => c.pin.blocklist.every((pin) => pin.length === c.pin.length), {
    message: "blocklist entries must have pin.length digits",
  })
  .refine((c) => c.lock.idleMinutes <= c.lock.maxMinutes, {
    message: "lock.idleMinutes must not exceed lock.maxMinutes",
  });

export type ChatConfig = z.output<typeof chatConfigSchema>;

export const CHAT_CONFIG = loadConfig("chat-config", chatConfigSchema, raw);
