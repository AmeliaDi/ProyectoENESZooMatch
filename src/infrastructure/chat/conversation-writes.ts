/**
 * Write half of the Supabase chat adapter (docs/CHAT.md §10–13). Guarded
 * updates (`.eq(column, previous)`) make lost races a `false`, not an error.
 * Notifications never carry content, alias or which conversation changed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversationRepository } from "@/application/chat";
import { CHAT_CONFIG } from "@/config";
import { CHAT_NOTICE } from "@/domain/messages/chat-notice";
import { ok } from "@/domain/shared";
import { RPC, TABLE, attempt, failed } from "@/infrastructure/supabase/shared";

const UNIQUE_VIOLATION = "23505";
const SETTINGS = CHAT_CONFIG.conversation;

type Writes = Pick<
  ConversationRepository,
  "openRound" | "saveAnswer" | "react" | "feedback" | "setFreeReady" | "addMessage" | "markSeen" | "setPaused" | "setMuted"
  | "deleteMine" | "leave" | "block" | "report" | "purge" | "notify"
>;

/** Insert that reports a duplicate key as `false` (already done), not a failure. */
async function insertOnce(run: () => PromiseLike<{ error: { code?: string } | null }>, duplicateIs = false) {
  const res = await attempt(run);
  if (!res) return failed;
  if (res.error) return res.error.code === UNIQUE_VIOLATION ? ok(duplicateIs) : failed;
  return ok(true);
}

async function changed(run: () => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const res = await attempt(run);
  return res && !res.error ? ok((res.data?.length ?? 0) > 0) : failed;
}

async function done(run: () => PromiseLike<{ error: unknown }>) {
  const res = await attempt(run);
  return res && !res.error ? ok(undefined) : failed;
}

async function rpcBoolean(admin: SupabaseClient, name: string, args: Record<string, unknown>) {
  const res = await attempt(() => admin.rpc(name, args));
  return res && !res.error ? ok(res.data === true) : failed;
}

function roundWrites(admin: SupabaseClient): Pick<Writes, "openRound" | "saveAnswer" | "react" | "feedback"> {
  return {
    openRound: (id, index, asker, question, at) =>
      insertOnce(() => admin.from(TABLE.rounds).insert({
        conversation_id: id, idx: index, asker, created_at: at.toISOString(),
        prompt_id: "promptId" in question ? question.promptId : null,
        custom_text: "customText" in question ? question.customText : null,
      })),
    saveAnswer: (id, author, round, answer, at) =>
      insertOnce(() => admin.from(TABLE.answers).insert({
        conversation_id: id, author, round, created_at: at.toISOString(),
        passed: "passed" in answer, body: "passed" in answer ? "" : answer.body,
      })),
    react: (id, round, author, emoji, at) =>
      done(() => emoji === null
        ? admin.from(TABLE.reactions).delete().eq("conversation_id", id).eq("idx", round).eq("author", author)
        : admin.from(TABLE.reactions).upsert({ conversation_id: id, idx: round, author, emoji, created_at: at.toISOString() })),
    feedback: (id, author, round, liked) =>
      rpcBoolean(admin, RPC.roundFeedback, { p_conversation: id, p_user: author, p_idx: round, p_liked: liked }),
  };
}

function stateWrites(admin: SupabaseClient): Pick<Writes, "setFreeReady" | "addMessage" | "markSeen" | "setPaused" | "setMuted" | "deleteMine"> {
  const conversations = () => admin.from(TABLE.conversations);
  return {
    setFreeReady(id, side, ready, actor, at) {
      const column = side === "a" ? "free_ready_a" : "free_ready_b";
      return changed(() => conversations().update({ [column]: ready, last_actor: actor, updated_at: at.toISOString() }).eq("id", id).eq(column, !ready).select("id"));
    },
    addMessage: (id, author, body, clientKey, at) =>
      insertOnce(() => admin.from(TABLE.messages).insert({ conversation_id: id, author, body, client_key: clientKey, created_at: at.toISOString() }), true),
    markSeen: (id, side, at) => done(() => conversations().update({ [side === "a" ? "seen_a" : "seen_b"]: at.toISOString() }).eq("id", id)),
    setPaused(id, by, at) {
      const query = conversations().update({ paused_by: by, updated_at: at.toISOString() }).eq("id", id);
      return changed(() => (by === null ? query.not("paused_by", "is", null) : query.is("paused_by", null)).select("id"));
    },
    setMuted: (id, side, muted) => done(() => conversations().update({ [side === "a" ? "muted_a" : "muted_b"]: muted }).eq("id", id)),
    async deleteMine(id, userId) {
      const messages = await done(() => admin.from(TABLE.messages).delete().eq("conversation_id", id).eq("author", userId));
      if (!messages.ok) return messages;
      return done(() => admin.from(TABLE.answers).update({ body: "", passed: true }).eq("conversation_id", id).eq("author", userId));
    },
  };
}

function exitWrites(admin: SupabaseClient): Pick<Writes, "leave" | "block" | "report" | "purge" | "notify"> {
  return {
    leave: (id, userId) => done(() => admin.rpc(RPC.leaveConversation, { p_id: id, p_user: userId })),
    block: (id, userId) => rpcBoolean(admin, RPC.blockChatUser, { p_blocker: userId, p_conversation: id }),
    report: (id, userId, reason) =>
      rpcBoolean(admin, RPC.reportConversation, { p_reporter: userId, p_conversation: id, p_reason: reason, p_snapshot: SETTINGS.reportSnapshot }),
    async purge() {
      await attempt(() => admin.rpc(RPC.purgeChat, {
        p_message_days: SETTINGS.retention.messageDays,
        p_inactive_days: SETTINGS.retention.inactiveDays,
        p_signal_days: SETTINGS.signals.expireDays,
        p_cooldown_days: SETTINGS.signals.cooldownDays,
      }));
    },
    async notify(userId) {
      const unread = await attempt(() =>
        admin.from(TABLE.notifications).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "chat").eq("read", false),
      );
      if (!unread || unread.error || (unread.count ?? 0) > 0) return;
      await attempt(() => admin.from(TABLE.notifications).insert({ user_id: userId, type: "chat", ...CHAT_NOTICE, metadata: {} }));
    },
  };
}

export function conversationWrites(admin: SupabaseClient): Writes {
  return { ...roundWrites(admin), ...stateWrites(admin), ...exitWrites(admin) };
}
