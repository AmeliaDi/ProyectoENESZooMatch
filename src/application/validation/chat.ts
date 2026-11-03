import { z } from "zod";

import { CHAT_CONFIG } from "@/config";

import { matriculaSchema } from "./common";

/**
 * Shape only (digits, length); strength is a use-case rule so the client gets
 * `chat.pin_weak`, not a generic invalid request.
 */
export const pinSchema = z.string().regex(new RegExp(`^[0-9]{${CHAT_CONFIG.pin.length}}$`));

export const createPinSchema = z.strictObject({ pin: pinSchema, confirm: pinSchema });
export const unlockSchema = z.strictObject({ pin: pinSchema });
export const changePinSchema = z.strictObject({ current: pinSchema, pin: pinSchema, confirm: pinSchema });
export const recoveryRequestSchema = z.strictObject({ matricula: matriculaSchema });
export const recoveryCancelSchema = z.strictObject({ pin: pinSchema });

/** Generous outer bound: the use case cleans and enforces the exact limit. */
const RAW_TEXT_FACTOR = 2;
const conversation = CHAT_CONFIG.conversation;
const maxRounds = Math.max(conversation.rounds.romance.length, conversation.rounds.amistad.length);

export const conversationIdSchema = z.uuid();
export const answerSchema = z.strictObject({
  round: z.number().int().min(0).max(maxRounds - 1),
  body: z.string().min(1).max(conversation.answerChars * RAW_TEXT_FACTOR),
});
export const messageSchema = z.strictObject({
  body: z.string().min(1).max(conversation.messageChars * RAW_TEXT_FACTOR),
});
export const acceptSchema = z.strictObject({});
/** The opaque per-viewer match handle (hex) of the result view. */
export const interestSchema = z.strictObject({
  match: z.string().regex(/^[0-9a-f]{16}$/),
  track: z.enum(["romance", "amistad"]),
});
