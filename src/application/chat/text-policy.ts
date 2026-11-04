/**
 * Server-side text policy (docs/CHAT.md §12.3–12.4): grapheme limit, link and
 * offensive-language blocks, per-minute/per-day caps and repeat detection.
 * Contact hints (phone, e-mail, @) never block here: the composer warns
 * before sending, so a person can still choose to share.
 */
import { CHAT_MODERATION } from "@/config/chat-moderation";
import { cleanChatText, guardChatText } from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import type { ConversationRepository } from "./conversation-ports";
import { SETTINGS } from "./settings";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export function guardText(raw: string, maxGraphemes: number): Result<string, AppError> {
  const text = cleanChatText(raw, maxGraphemes);
  if (text === null) return err("request.invalid");
  const verdict = guardChatText(text, CHAT_MODERATION);
  if (verdict.kind === "blocked") return err(verdict.reason === "link" ? "chat.link_blocked" : "chat.offensive");
  return ok(text);
}

/** Caps per minute and per day, and refuses the same text sent again and again. */
export async function checkMessageRate(author: string, body: string, now: Date, repo: Pick<ConversationRepository, "recentMessagesBy">): Promise<Result<true, AppError>> {
  const { messagesPerMinute, messagesPerDay, repeatWindow } = SETTINGS.limits;
  const day = await repo.recentMessagesBy(author, new Date(now.getTime() - MS_PER_DAY), messagesPerDay);
  if (!day.ok) return day;
  if (day.value.length >= messagesPerDay) return err("chat.slow_down");
  const minuteAgo = now.getTime() - MS_PER_MINUTE;
  if (day.value.filter((m) => m.at.getTime() >= minuteAgo).length >= messagesPerMinute) return err("chat.slow_down");
  const last = day.value.slice(0, repeatWindow);
  if (last.length === repeatWindow && last.every((m) => m.body === body)) return err("chat.repeated");
  return ok(true);
}
