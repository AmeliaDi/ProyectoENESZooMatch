/**
 * Anonymity and tone guard of chat text (docs/CHAT.md §12.4). Pure: the word
 * lists come from `data/chat-moderation.json` as a parameter.
 *
 *   * links      → blocked (could carry anything, including identity)
 *   * offensive  → blocked with a kind explanation (the list is never shown)
 *   * phone, e-mail, @handle, "mi insta" → allowed, with a gentle notice
 */

export interface ModerationLists {
  ofensivo: readonly string[];
  frases: readonly string[];
  redes: readonly string[];
}

export type ContactKind = "phone" | "email" | "handle";

export type GuardVerdict =
  | { kind: "ok"; notice: ContactKind[] }
  | { kind: "blocked"; reason: "link" | "offensive" };

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|mx|net|org|io|me|gg|app|link|ly|co|tv|xyz)(?:\/\S*)?\b/i;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/i;
const HANDLE = /(?:^|\s)@[a-z0-9._]{3,}/i;
/** Ten or more digits once spaces, dots and dashes are removed (MX numbers). */
const PHONE_DIGITS = 10;
const PHONE_RUN = /\+?\d[\d\s.-]{8,}\d/g;

/** Lowercase, accents removed (ñ kept), letters and spaces only. */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/(?!\u0303)[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[^a-zñ0-9]+/g, " ")
    .trim();
}

function hasPhone(text: string): boolean {
  return [...text.matchAll(PHONE_RUN)].some((m) => m[0].replace(/\D/g, "").length >= PHONE_DIGITS);
}

function mentionsNetwork(words: readonly string[], lists: ModerationLists): boolean {
  return words.some((w, i) => lists.redes.includes(w) && (words[i - 1] === "mi" || words[i - 1] === "por"));
}

export function contactHints(text: string, lists: ModerationLists): ContactKind[] {
  const words = foldText(text).split(" ");
  const out: ContactKind[] = [];
  if (hasPhone(text)) out.push("phone");
  if (EMAIL.test(text)) out.push("email");
  if (HANDLE.test(text) || mentionsNetwork(words, lists)) out.push("handle");
  return out;
}

export function isOffensive(text: string, lists: ModerationLists): boolean {
  const folded = ` ${foldText(text)} `;
  const words = new Set(folded.trim().split(" "));
  return lists.ofensivo.some((w) => words.has(w)) || lists.frases.some((p) => folded.includes(` ${p} `));
}

export function hasLink(text: string): boolean {
  return LINK.test(text.replace(EMAIL, " "));
}

export function guardChatText(text: string, lists: ModerationLists): GuardVerdict {
  if (hasLink(text)) return { kind: "blocked", reason: "link" };
  if (isOffensive(text, lists)) return { kind: "blocked", reason: "offensive" };
  return { kind: "ok", notice: contactHints(text, lists) };
}
