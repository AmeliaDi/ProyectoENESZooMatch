/**
 * Supabase adapter of `ConversationRepository` (docs/CHAT.md §10). Every
 * table is server-only (RLS, no policies); this service-role adapter always
 * filters by participant, so a conversation id alone never reads anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { ConversationRepository, ConversationRow } from "@/application/chat";
import { CHAT_NOTICE } from "@/domain/messages/chat-notice";
import { ok } from "@/domain/shared";
import { RPC, TABLE, attempt, failed } from "@/infrastructure/supabase/shared";

const UNIQUE_VIOLATION = "23505";
const UUID = z.uuid();
const track = z.enum(["romance", "amistad"]);
const date = z.string().transform((value) => new Date(value));

const CONVERSATION_COLUMNS = "id, track, user_a, user_b, free_ready_a, free_ready_b, seen_a, seen_b, last_actor, updated_at";
const conversationSchema = z.object({
  id: z.string(),
  track,
  user_a: z.string(),
  user_b: z.string(),
  free_ready_a: z.boolean(),
  free_ready_b: z.boolean(),
  seen_a: date.nullable(),
  seen_b: date.nullable(),
  last_actor: z.string().nullable(),
  updated_at: date,
});

const answerSchema = z.object({ conversation_id: z.string(), author: z.string(), round: z.number().int(), body: z.string().optional() });
const messageSchema = z.object({ id: z.string(), author: z.string(), body: z.string(), created_at: date });
const peerSchema = z.object({
  user_id: z.string(),
  alias: z.string().nullable(),
  animal_id: z.string().nullable(),
  color_id: z.string().nullable(),
  avatar_mark: z.enum(["sp", "so", "sx"]).nullable().catch(null),
  show_avatar_detail: z.boolean(),
});
const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sent") }),
  z.object({ kind: z.literal("gone") }),
  z.object({ kind: z.literal("open"), conversation: z.string() }),
]);

function toRow(row: z.output<typeof conversationSchema>): ConversationRow {
  return {
    id: row.id, track: row.track, userA: row.user_a, userB: row.user_b,
    freeReadyA: row.free_ready_a, freeReadyB: row.free_ready_b,
    seenA: row.seen_a, seenB: row.seen_b, lastActor: row.last_actor, updatedAt: row.updated_at,
  };
}

/** Insert that reports a duplicate key as `false` (already answered), not a failure. */
async function insertOnce(run: () => PromiseLike<{ error: { code?: string } | null }>) {
  const res = await attempt(run);
  if (!res) return failed;
  if (res.error) return res.error.code === UNIQUE_VIOLATION ? ok(false) : failed;
  return ok(true);
}

function interestQueries(admin: SupabaseClient): Pick<ConversationRepository, "interestsFrom" | "expressInterest" | "withdrawInterest"> {
  return {
    async interestsFrom(userId) {
      const res = await attempt(() => admin.from(TABLE.chatInterests).select("to_user, track").eq("from_user", userId));
      if (!res || res.error) return failed;
      const rows = z.array(z.object({ to_user: z.string(), track })).safeParse(res.data ?? []);
      return rows.success ? ok(rows.data.map((r) => ({ to: r.to_user, track: r.track }))) : failed;
    },
    async expressInterest(from, to, pairTrack) {
      const res = await attempt(() => admin.rpc(RPC.expressInterest, { p_from: from, p_to: to, p_track: pairTrack }));
      if (!res || res.error) return failed;
      const parsed = outcomeSchema.safeParse(res.data);
      if (!parsed.success) return failed;
      const value = parsed.data;
      return ok(value.kind === "open" ? { kind: "open", conversationId: value.conversation } : value);
    },
    async withdrawInterest(from, to, pairTrack) {
      const res = await attempt(() =>
        admin.from(TABLE.chatInterests).delete().eq("from_user", from).eq("to_user", to).eq("track", pairTrack),
      );
      return res && !res.error ? ok(undefined) : failed;
    },
  };
}

function readQueries(admin: SupabaseClient): Pick<ConversationRepository, "listFor" | "answersOf" | "findFor" | "messages" | "peers"> {
  return {
    async listFor(userId) {
      const res = await attempt(() =>
        admin.from(TABLE.conversations).select(CONVERSATION_COLUMNS).or(`user_a.eq.${userId},user_b.eq.${userId}`),
      );
      if (!res || res.error) return failed;
      const rows = z.array(conversationSchema).safeParse(res.data ?? []);
      return rows.success ? ok(rows.data.map(toRow)) : failed;
    },
    async answersOf(ids, withBodies) {
      if (ids.length === 0) return ok([]);
      const columns = withBodies ? "conversation_id, author, round, body" : "conversation_id, author, round";
      const res = await attempt(() => admin.from(TABLE.answers).select(columns).in("conversation_id", [...ids]));
      if (!res || res.error) return failed;
      const rows = z.array(answerSchema).safeParse(res.data ?? []);
      if (!rows.success) return failed;
      return ok(rows.data.map((r) => ({ conversationId: r.conversation_id, author: r.author, round: r.round, body: r.body ?? "" })));
    },
    async findFor(id, userId) {
      if (!UUID.safeParse(id).success) return ok(null);
      const res = await attempt(() =>
        admin.from(TABLE.conversations).select(CONVERSATION_COLUMNS).eq("id", id)
          .or(`user_a.eq.${userId},user_b.eq.${userId}`).maybeSingle(),
      );
      if (!res || res.error) return failed;
      if (!res.data) return ok(null);
      const row = conversationSchema.safeParse(res.data);
      return row.success ? ok(toRow(row.data)) : failed;
    },
    async messages(id, limit) {
      const res = await attempt(() =>
        admin.from(TABLE.messages).select("id, author, body, created_at").eq("conversation_id", id)
          .order("created_at", { ascending: false }).limit(limit),
      );
      if (!res || res.error) return failed;
      const rows = z.array(messageSchema).safeParse(res.data ?? []);
      return rows.success ? ok(rows.data.reverse().map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.created_at }))) : failed;
    },
    async peers(userIds) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select("user_id, alias, animal_id, color_id, avatar_mark, show_avatar_detail").in("user_id", [...userIds]),
      );
      if (!res || res.error) return failed;
      const rows = z.array(peerSchema).safeParse(res.data ?? []);
      if (!rows.success) return failed;
      return ok(rows.data.map((p) => ({
        userId: p.user_id, alias: p.alias, animalId: p.animal_id, colorId: p.color_id,
        mark: p.avatar_mark, showAvatarDetail: p.show_avatar_detail,
      })));
    },
  };
}

function writeQueries(admin: SupabaseClient): Pick<ConversationRepository, "saveAnswer" | "acceptFree" | "addMessage" | "markSeen" | "leave" | "notify"> {
  return {
    saveAnswer: (id, author, round, body, at) =>
      insertOnce(() => admin.from(TABLE.answers).insert({ conversation_id: id, author, round, body, created_at: at.toISOString() })),
    addMessage: (id, author, body, at) =>
      insertOnce(() => admin.from(TABLE.messages).insert({ conversation_id: id, author, body, created_at: at.toISOString() })),
    async acceptFree(id, side, actor, at) {
      const column = side === "a" ? "free_ready_a" : "free_ready_b";
      const res = await attempt(() =>
        admin.from(TABLE.conversations).update({ [column]: true, last_actor: actor, updated_at: at.toISOString() })
          .eq("id", id).eq(column, false).select("id"),
      );
      return res && !res.error ? ok((res.data?.length ?? 0) > 0) : failed;
    },
    async markSeen(id, side, at) {
      const column = side === "a" ? "seen_a" : "seen_b";
      const res = await attempt(() => admin.from(TABLE.conversations).update({ [column]: at.toISOString() }).eq("id", id));
      return res && !res.error ? ok(undefined) : failed;
    },
    async leave(id, userId) {
      const res = await attempt(() => admin.rpc(RPC.leaveConversation, { p_id: id, p_user: userId }));
      return res && !res.error ? ok(undefined) : failed;
    },
    async notify(userId) {
      const unread = await attempt(() =>
        admin.from(TABLE.notifications).select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("type", "chat").eq("read", false),
      );
      if (!unread || unread.error || (unread.count ?? 0) > 0) return;
      await attempt(() => admin.from(TABLE.notifications).insert({ user_id: userId, type: "chat", ...CHAT_NOTICE, metadata: {} }));
    },
  };
}

export function supabaseConversationRepository(admin: SupabaseClient): ConversationRepository {
  return { ...interestQueries(admin), ...readQueries(admin), ...writeQueries(admin) };
}
