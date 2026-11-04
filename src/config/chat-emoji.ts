import { z } from "zod";

import raw from "../../data/chat-emoji.json";
import { loadConfig } from "./load";

const MAX_RECENT = 24;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

const emojiSchema = z
  .tuple([z.string().regex(PICTOGRAPHIC), z.string().min(1), z.string()])
  .transform(([char, name, keywords]) => ({ char, name, keywords }));

/**
 * Light emoji picker catalogue (docs/CHAT.md §12.6): system emoji with es-MX
 * names. The name is what screen readers announce and what search matches.
 * Kept in data so screen sources stay free of literal emoji.
 */
export const chatEmojiSchema = z.strictObject({
  version: z.string().min(1),
  fuente: z.string().min(1),
  recentes_max: z.number().int().positive().max(MAX_RECENT),
  grupos: z
    .array(z.strictObject({ id: z.string().regex(/^[a-z_]+$/), nombre: z.string().min(1), emojis: z.array(emojiSchema).min(1) }))
    .min(1),
});

export type ChatEmojiCatalog = z.output<typeof chatEmojiSchema>;
export type ChatEmoji = ChatEmojiCatalog["grupos"][number]["emojis"][number];

export const CHAT_EMOJI = loadConfig("chat-emoji", chatEmojiSchema, raw);
