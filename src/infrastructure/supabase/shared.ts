/** Table/RPC names and helpers shared by the Supabase adapters. */
import type { StorageError } from "@/application/errors";
import { err } from "@/domain/shared";

/** Every table and RPC name the app uses; mirrored by the base migration. */
export const TABLE = {
  profiles: "profiles",
  responses: "quiz_responses",
  notifications: "notifications",
  roles: "user_roles",
  chatPins: "chat_pins",
  chatEvents: "chat_security_events",
  chatInterests: "chat_interests",
  conversations: "conversations",
  answers: "conversation_answers",
  messages: "conversation_messages",
  rounds: "conversation_rounds",
  reactions: "conversation_reactions",
  feedbackDaily: "chat_feedback_daily",
  blocks: "chat_blocks",
  closures: "chat_closures",
  reports: "chat_reports",
  reportAudit: "chat_report_audit",
} as const;
export const RPC = {
  submit: "submit_quiz_result",
  poolVersion: "get_pool_version",
  replace: "replace_matches",
  userMatches: "get_user_matches",
  notify: "notify_matches",
  dashboard: "get_admin_dashboard",
  myNotifications: "get_my_notifications",
  markRead: "mark_notifications_read",
  expressInterest: "express_chat_interest",
  leaveConversation: "leave_conversation",
  blockChatUser: "block_chat_user",
  reportConversation: "report_conversation",
  roundFeedback: "record_round_feedback",
  purgeChat: "purge_chat",
} as const;

export const PROFILE_PAGE_SIZE = 1000;
/** Neutral score for a dimension missing from a stored profile. */
export const NEUTRAL_SCORE = 0.5;
/** Placeholder MBTI when a legacy row has none; it does not affect vectors. */
export const FALLBACK_MBTI = "ENTJ";
/** `replace_matches` returns this sentinel when the completed pool changed. */
export const POOL_CHANGED_SENTINEL = -1;

export const failed = err<StorageError>("storage.failed");

export async function attempt<T>(run: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export function firstJoined(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}
