import { z } from "zod";

import raw from "../../data/chat-config.json";
import { loadConfig } from "./load";

const positiveInt = z.number().int().positive();
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;
/** scrypt needs 128·N·r bytes; below N = 2^14 it is too cheap to matter. */
const MIN_LOG2N = 14;
const MAX_LOG2N = 20;
const MIN_TEXT_CHARS = 40;
/** Hard ceiling shared with the SQL CHECKs (graphemes ≤ code points ≤ this margin). */
export const MAX_TEXT_CHARS = 300;
const MAX_REACTIONS = 12;

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
    /** Chat between matches (docs/CHAT.md §10–13): signals, guided rounds, free chat. */
    conversation: z.strictObject({
      /** Limits counted in graphemes (Intl.Segmenter), same on client, API and DB. */
      answerChars: z.number().int().min(MIN_TEXT_CHARS).max(MAX_TEXT_CHARS),
      messageChars: z.number().int().min(MIN_TEXT_CHARS).max(MAX_TEXT_CHARS),
      customQuestionChars: z.number().int().min(MIN_TEXT_CHARS).max(MAX_TEXT_CHARS),
      /** Newest free-chat messages returned per read; older ones page by cursor. */
      messagesPage: positiveInt,
      /** Client polling while visible; backs off up to `pollMaxSeconds` when idle. */
      pollSeconds: positiveInt,
      pollMaxSeconds: positiveInt,
      inboxPollSeconds: positiveInt,
      signals: z.strictObject({
        /** A signal nobody answered simply expires (the sender is never told). */
        expireDays: positiveInt,
        /** Open (unanswered) signals one person may have at once. */
        maxOpen: positiveInt,
        /** After a close or block, that pair cannot signal again for this long. */
        cooldownDays: positiveInt,
      }),
      rounds: z.strictObject({
        /** Completed rounds before either side may invite to free chat. */
        minForFree: positiveInt,
        /** Question cards offered per turn. */
        suggestions: positiveInt,
        /** Sealed answers are revealed when both answered or after this wait. */
        revealHours: positiveInt,
        /** Round index from which level 1, 2 and 3 questions are offered. */
        levelFromRound: z.tuple([z.literal(0), z.number().int().positive(), z.number().int().positive()]),
        maxRounds: positiveInt,
      }),
      limits: z.strictObject({
        messagesPerMinute: positiveInt,
        messagesPerDay: positiveInt,
        /** Identical consecutive messages refused (basic spam guard). */
        repeatWindow: positiveInt,
      }),
      retention: z.strictObject({
        messageDays: positiveInt,
        /** A conversation with no activity for this long closes by itself. */
        inactiveDays: positiveInt,
      }),
      /** Quick reactions to a revealed answer (system emoji). */
      reactions: z.array(z.string().min(1)).min(1).max(MAX_REACTIONS),
      /** Newest messages copied into a report snapshot for moderation. */
      reportSnapshot: positiveInt,
    }),
  })
  .refine((c) => c.pin.blocklist.every((pin) => pin.length === c.pin.length), {
    message: "blocklist entries must have pin.length digits",
  })
  .refine((c) => c.lock.idleMinutes <= c.lock.maxMinutes, {
    message: "lock.idleMinutes must not exceed lock.maxMinutes",
  })
  .refine(
    (c) => {
      const [, two, three] = c.conversation.rounds.levelFromRound;
      return two < three && c.conversation.rounds.minForFree <= c.conversation.rounds.maxRounds;
    },
    { message: "rounds.levelFromRound must increase and minForFree must fit maxRounds" },
  )
  .refine((c) => c.conversation.pollSeconds <= c.conversation.pollMaxSeconds, {
    message: "pollSeconds must not exceed pollMaxSeconds",
  });

export type ChatConfig = z.output<typeof chatConfigSchema>;

export const CHAT_CONFIG = loadConfig("chat-config", chatConfigSchema, raw);
