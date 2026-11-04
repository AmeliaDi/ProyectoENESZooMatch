import { z } from "zod";

import { CHAT_CONFIG } from "@/config";
import { REPORT_REASONS } from "@/contracts/chat";

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

/**
 * Generous outer bound in UTF-16 units (a grapheme can span several): the use
 * case cleans the text and enforces the exact grapheme limit.
 */
const RAW_TEXT_FACTOR = 8;
const conversation = CHAT_CONFIG.conversation;
const roundIndex = z.number().int().min(0).max(conversation.rounds.maxRounds - 1);
const rawText = (graphemes: number) => z.string().min(1).max(graphemes * RAW_TEXT_FACTOR);

export const conversationIdSchema = z.uuid();
export const askSchema = z.union([
  z.strictObject({ promptId: z.string().regex(/^[par][0-9]{3}$/) }),
  z.strictObject({ customText: rawText(conversation.customQuestionChars) }),
]);
export const answerSchema = z.union([
  z.strictObject({ round: roundIndex, body: rawText(conversation.answerChars) }),
  z.strictObject({ round: roundIndex, pass: z.literal(true) }),
]);
export const reactSchema = z.strictObject({ round: roundIndex, emoji: z.string().min(1).max(16).nullable() });
export const feedbackSchema = z.strictObject({ round: roundIndex, liked: z.boolean() });
export const freeSchema = z.strictObject({ ready: z.boolean() });
export const messageSchema = z.strictObject({ body: rawText(conversation.messageChars), clientKey: z.uuid() });
export const toggleSchema = z.strictObject({ on: z.boolean() });
export const reportSchema = z.strictObject({ reason: z.enum(REPORT_REASONS) });
export const emptySchema = z.strictObject({});
/** The opaque per-viewer match handle (hex) of the result view. */
export const interestSchema = z.strictObject({
  match: z.string().regex(/^[0-9a-f]{16}$/),
  track: z.enum(["romance", "amistad"]),
});
/** Query of GET .../conversations/[id]: card page and message cursor. */
export const viewQuerySchema = z.object({
  refresh: z.coerce.number().int().min(0).max(1000).optional(),
  before: z.iso.datetime({ offset: true }).optional(),
});
