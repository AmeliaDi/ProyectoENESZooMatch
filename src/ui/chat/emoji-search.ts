/**
 * Pure helpers of the emoji picker: accent-free search in Spanish and a
 * bounded "recent" list kept in localStorage (failures are ignored: the
 * picker works without it).
 */
import { CHAT_EMOJI, type ChatEmoji } from "@/config";

const RECENT_KEY = "zm-chat-emoji-recent";

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const ALL_EMOJI: readonly ChatEmoji[] = CHAT_EMOJI.grupos.flatMap((g) => g.emojis);
const BY_CHAR = new Map(ALL_EMOJI.map((e) => [e.char, e]));

export function searchEmoji(query: string): ChatEmoji[] {
  const q = fold(query.trim());
  if (!q) return [...ALL_EMOJI];
  return ALL_EMOJI.filter((e) => fold(`${e.name} ${e.keywords}`).includes(q));
}

export function emojiName(char: string): string | null {
  return BY_CHAR.get(char)?.name ?? null;
}

export function pushRecent(list: readonly string[], char: string, max = CHAT_EMOJI.recentes_max): string[] {
  return [char, ...list.filter((c) => c !== char)].slice(0, max);
}

export function readRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string" && BY_CHAR.has(c)) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list: readonly string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private mode or full storage: recents simply do not persist.
  }
}
