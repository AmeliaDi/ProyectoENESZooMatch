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
