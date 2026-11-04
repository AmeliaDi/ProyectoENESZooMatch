/**
 * Client copy of the contact-hint lists: only the social network names (to
 * warn about "mi insta"). The offensive-word list never reaches the browser;
 * the server checks it.
 */
import { CHAT_SOCIAL_NETWORKS } from "@/config";
import type { ModerationLists } from "@/domain/chat";

export const CHAT_MODERATION_HINTS: ModerationLists = { ofensivo: [], frases: [], redes: CHAT_SOCIAL_NETWORKS };
