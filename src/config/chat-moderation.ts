import { z } from "zod";

import raw from "../../data/chat-moderation.json";
import { CHAT_SOCIAL_NETWORKS } from "./chat-contact";
import { loadConfig } from "./load";

const word = z.string().regex(/^[a-zñ]+$/, "lowercase, unaccented, one word");
const phrase = z.string().regex(/^[a-zñ]+( [a-zñ]+)+$/, "lowercase, unaccented, several words");

/**
 * Soft es-MX moderation list (docs/CHAT.md §12.4). Compared by whole word on
 * accent-free lowercase text; the list itself is never sent to clients.
 */
export const chatModerationSchema = z.strictObject({
  version: z.string().min(1),
  etiqueta: z.literal("supuesto_diseno"),
  fuente: z.string().min(1),
  revision: z.strictObject({
    fecha: z.iso.date(),
    falsos_positivos_revisados: z.array(z.string().min(1)),
  }),
  ofensivo: z.array(word).min(1),
  frases: z.array(phrase),
});

const moderation = loadConfig("chat-moderation", chatModerationSchema, raw);

/** Server-only: offensive lists plus the shared social network names. */
export const CHAT_MODERATION = { ofensivo: moderation.ofensivo, frases: moderation.frases, redes: CHAT_SOCIAL_NETWORKS, revision: moderation.revision };
