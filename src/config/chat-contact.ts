import { z } from "zod";

import raw from "../../data/chat-contact.json";
import { loadConfig } from "./load";

/** Social network names for the gentle "cuida tu anonimato" notice (client and server). */
export const chatContactSchema = z.strictObject({
  version: z.string().min(1),
  fuente: z.string().min(1),
  redes: z.array(z.string().regex(/^[a-zñ]+$/)).min(1),
});

export const CHAT_SOCIAL_NETWORKS: readonly string[] = loadConfig("chat-contact", chatContactSchema, raw).redes;
