/**
 * Supabase adapter of `ConversationRepository` — signals and reads
 * (docs/CHAT.md §10–13). Every table is server-only (RLS, no policies); this
 * service-role adapter always filters by participant, so a conversation id
 * alone never reads anything. Writes live in conversation-writes.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { ConversationRepository, ConversationRow } from "@/application/chat";
import { counterpartIdentity } from "@/application/identity-dto";
import { CHAT_CONFIG } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import type { SpriteMark } from "@/contracts/result";
import { ok } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import { latentSchema } from "@/infrastructure/supabase/profile-repository";
import { RPC, TABLE, attempt, failed } from "@/infrastructure/supabase/shared";

import { conversationWrites } from "./conversation-writes";

const UUID = z.uuid();
const track = z.enum(["romance", "amistad"]);
const date = z.string().transform((value) => new Date(value));
const SIGNALS = CHAT_CONFIG.conversation.signals;

const CONVERSATION_COLUMNS =
  "id, track, user_a, user_b, free_ready_a, free_ready_b, seen_a, seen_b, muted_a, muted_b, paused_by, last_actor, created_at, updated_at";
const conversationSchema = z.object({
  id: z.string(), track, user_a: z.string(), user_b: z.string(),
  free_ready_a: z.boolean(), free_ready_b: z.boolean(),
  seen_a: date.nullable(), seen_b: date.nullable(),
  muted_a: z.boolean(), muted_b: z.boolean(), paused_by: z.string().nullable(),
  last_actor: z.string().nullable(), created_at: date, updated_at: date,
});
const interestSchema = z.object({ from_user: z.string(), to_user: z.string(), track, created_at: date, declined_at: z.string().nullable() });
/** The stored identity, read as written on eclosion; no name is built here. */
const PEER_COLUMNS =
  "user_id, estado_identidad, alias_completo, alias_animal, alias_color, alias_sufijo, animal_id, color_id, mbti_code, enneagram_code, avatar_mark, show_avatar_detail";
const roundSchema = z.object({
  conversation_id: z.string(), idx: z.number().int(), asker: z.string(),
  prompt_id: z.string().nullable(), custom_text: z.string().nullable(),
  feedback_a: z.boolean(), feedback_b: z.boolean(), created_at: date,
});
const answerSchema = z.object({ conversation_id: z.string(), author: z.string(), round: z.number().int(), passed: z.boolean(), body: z.string().optional() });
const messageSchema = z.object({ id: z.string(), author: z.string(), body: z.string(), created_at: date });
const peerSchema = z.object({
  user_id: z.string(),
  estado_identidad: z.enum(["huevo", "eclosionado"]).catch("huevo"),
  alias_completo: z.string().nullable(), alias_animal: z.string().nullable(),
  alias_color: z.string().nullable(), alias_sufijo: z.string().nullable(),
  animal_id: z.string().nullable(), color_id: z.string().nullable(),
  mbti_code: z.string().nullable(), enneagram_code: z.string().nullable(),
  avatar_mark: z.enum(["sp", "so", "sx"]).nullable().catch(null), show_avatar_detail: z.boolean(),
});
const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["sent", "gone", "adult_required", "cooldown", "too_many"]) }),
  z.object({ kind: z.literal("open"), conversation: z.string() }),
]);

function toRow(r: z.output<typeof conversationSchema>): ConversationRow {
  return {
    id: r.id, track: r.track, userA: r.user_a, userB: r.user_b, freeReadyA: r.free_ready_a, freeReadyB: r.free_ready_b,
    seenA: r.seen_a, seenB: r.seen_b, mutedA: r.muted_a, mutedB: r.muted_b, pausedBy: r.paused_by,
    lastActor: r.last_actor, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function select<S extends z.ZodType>(run: () => PromiseLike<{ data: unknown; error: unknown }>, schema: S) {
  const res = await attempt(run);
  if (!res || res.error) return failed;
  const rows = z.array(schema).safeParse(res.data ?? []);
  return rows.success ? ok(rows.data) : failed;
}

type Signals = Pick<ConversationRepository, "interestsOf" | "expressInterest" | "withdrawInterest" | "declineInterest" | "isAdult" | "confirmAdult">;

function signalQueries(admin: SupabaseClient): Signals {
  const interests = () => admin.from(TABLE.chatInterests);
  return {
    async interestsOf(userId) {
      const rows = await select(() => interests().select("from_user, to_user, track, created_at, declined_at").or(`from_user.eq.${userId},to_user.eq.${userId}`), interestSchema);
      return rows.ok ? ok(rows.value.map((r) => ({ from: r.from_user, to: r.to_user, track: r.track, createdAt: r.created_at, declined: r.declined_at !== null }))) : rows;
    },
    async expressInterest(from, to, pairTrack) {
      const res = await attempt(() => admin.rpc(RPC.expressInterest, {
        p_from: from, p_to: to, p_track: pairTrack,
        p_expire_days: SIGNALS.expireDays, p_max_open: SIGNALS.maxOpen, p_cooldown_days: SIGNALS.cooldownDays,
      }));
      if (!res || res.error) return failed;
      const parsed = outcomeSchema.safeParse(res.data);
      if (!parsed.success) return failed;
      const value = parsed.data;
      return ok(value.kind === "open" ? { kind: "open", conversationId: value.conversation } : { kind: value.kind });
    },
    async withdrawInterest(from, to, pairTrack) {
      const res = await attempt(() => interests().delete().eq("from_user", from).eq("to_user", to).eq("track", pairTrack));
      return res && !res.error ? ok(undefined) : failed;
    },
    async declineInterest(from, to, pairTrack, at) {
      const res = await attempt(() => interests().update({ declined_at: at.toISOString() }).eq("from_user", from).eq("to_user", to).eq("track", pairTrack));
      return res && !res.error ? ok(undefined) : failed;
    },
    async isAdult(userId) {
      const res = await attempt(() => admin.from(TABLE.profiles).select("adult_confirmed_at").eq("user_id", userId).maybeSingle());
      if (!res || res.error) return failed;
      return ok(Boolean((res.data as { adult_confirmed_at?: string | null } | null)?.adult_confirmed_at));
    },
    async confirmAdult(userId, at) {
      const res = await attempt(() => admin.from(TABLE.profiles).update({ adult_confirmed_at: at.toISOString() }).eq("user_id", userId).is("adult_confirmed_at", null));
      return res && !res.error ? ok(undefined) : failed;
    },
  };
}

type Reads = Pick<ConversationRepository, "listFor" | "findFor" | "roundsOf" | "answersOf" | "reactionsOf" | "messages" | "recentMessagesBy" | "peers" | "latents">;

function conversationReads(admin: SupabaseClient): Pick<Reads, "listFor" | "findFor" | "roundsOf" | "answersOf" | "reactionsOf"> {
  return {
    async listFor(userId) {
      const rows = await select(() => admin.from(TABLE.conversations).select(CONVERSATION_COLUMNS).or(`user_a.eq.${userId},user_b.eq.${userId}`), conversationSchema);
      return rows.ok ? ok(rows.value.map(toRow)) : rows;
    },
    async findFor(id, userId) {
      if (!UUID.safeParse(id).success) return ok(null);
      const rows = await select(() => admin.from(TABLE.conversations).select(CONVERSATION_COLUMNS).eq("id", id).or(`user_a.eq.${userId},user_b.eq.${userId}`), conversationSchema);
      return rows.ok ? ok(rows.value[0] ? toRow(rows.value[0]) : null) : rows;
    },
    async roundsOf(ids) {
      if (ids.length === 0) return ok([]);
      const rows = await select(() => admin.from(TABLE.rounds).select("conversation_id, idx, asker, prompt_id, custom_text, feedback_a, feedback_b, created_at").in("conversation_id", [...ids]), roundSchema);
      return rows.ok ? ok(rows.value.map((r) => ({
        conversationId: r.conversation_id, index: r.idx, asker: r.asker, promptId: r.prompt_id, customText: r.custom_text,
        feedbackA: r.feedback_a, feedbackB: r.feedback_b, createdAt: r.created_at,
      }))) : rows;
    },
    async answersOf(ids, withBodies) {
      if (ids.length === 0) return ok([]);
      const columns = withBodies ? "conversation_id, author, round, passed, body" : "conversation_id, author, round, passed";
      const rows = await select(() => admin.from(TABLE.answers).select(columns).in("conversation_id", [...ids]), answerSchema);
      return rows.ok ? ok(rows.value.map((r) => ({ conversationId: r.conversation_id, author: r.author, round: r.round, passed: r.passed, body: r.body ?? "" }))) : rows;
    },
    async reactionsOf(id) {
      const rows = await select(() => admin.from(TABLE.reactions).select("idx, author, emoji").eq("conversation_id", id), z.object({ idx: z.number().int(), author: z.string(), emoji: z.string() }));
      return rows.ok ? ok(rows.value.map((r) => ({ round: r.idx, author: r.author, emoji: r.emoji }))) : rows;
    },
  };
}

/**
 * One counterpart as the chat reads them. `identity` is what every screen
 * renders; the loose name fields only mirror it, because the port row still
 * carries them — they are projections of the same stored columns, never a
 * second source of a name. `userId` stays on the server.
 */
export interface ChatPeerRecord {
  userId: string;
  alias: string | null;
  animalId: string | null;
  colorId: string | null;
  mark: SpriteMark | null;
  showAvatarDetail: boolean;
  identity: IdentityDto;
}

/**
 * `null` for anyone the chat must not show: an egg has no name, and a hatched
 * row still missing any identity part would be read as an egg by the client,
 * so it is dropped here instead of half-rendered on screen.
 */
function toPeerRecord(row: z.output<typeof peerSchema>): ChatPeerRecord | null {
  if (row.estado_identidad !== "eclosionado") return null;
  if (!row.alias_completo || !row.alias_sufijo || !row.animal_id || !row.color_id) return null;

  // The chat reads neither the latent profile nor the shared reading layers.
  const identity = counterpartIdentity({
    userId: row.user_id,
    estadoIdentidad: row.estado_identidad,
    aliasCompleto: row.alias_completo,
    aliasAnimal: row.alias_animal,
    aliasColor: row.alias_color,
    aliasSufijo: row.alias_sufijo,
    mbtiCode: row.mbti_code,
    enneagramCode: row.enneagram_code,
    latent: null,
    animalId: row.animal_id,
    colorId: row.color_id,
    mark: row.avatar_mark,
    showAvatarDetail: row.show_avatar_detail,
    sharedLayers: [],
  });

  return {
    userId: row.user_id,
    alias: identity.aliasCompleto,
    animalId: identity.animalId,
    colorId: identity.colorId,
    mark: identity.mark,
    showAvatarDetail: row.show_avatar_detail,
    identity,
  };
}

function otherReads(admin: SupabaseClient): Pick<Reads, "messages" | "recentMessagesBy" | "peers" | "latents"> {
  const toMessage = (m: z.output<typeof messageSchema>) => ({ id: m.id, author: m.author, body: m.body, at: m.created_at });
  return {
    async messages(id, limit, before) {
      const rows = await select(() => {
        const query = admin.from(TABLE.messages).select("id, author, body, created_at").eq("conversation_id", id);
        return (before ? query.lt("created_at", before.toISOString()) : query).order("created_at", { ascending: false }).limit(limit);
      }, messageSchema);
      return rows.ok ? ok(rows.value.reverse().map(toMessage)) : rows;
    },
    async recentMessagesBy(author, since, limit) {
      const rows = await select(() => admin.from(TABLE.messages).select("id, author, body, created_at").eq("author", author)
        .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(limit), messageSchema);
      return rows.ok ? ok(rows.value.map(toMessage)) : rows;
    },
    async peers(userIds) {
      const rows = await select(() => admin.from(TABLE.profiles).select(PEER_COLUMNS).in("user_id", [...userIds])
        .eq("estado_identidad", "eclosionado").is("eliminado_en", null), peerSchema);
      if (!rows.ok) return rows;
      return ok(rows.value.map(toPeerRecord).filter((p): p is ChatPeerRecord => p !== null));
    },
    async latents(userIds) {
      const rows = await select(() => admin.from(TABLE.profiles).select("user_id, latent_profile").in("user_id", [...userIds])
        .is("eliminado_en", null), z.object({ user_id: z.string(), latent_profile: latentSchema }));
      if (!rows.ok) return rows;
      return ok(new Map(rows.value.flatMap((r): Array<[string, LatentProfile]> => (r.latent_profile ? [[r.user_id, r.latent_profile]] : []))));
    },
  };
}

export function supabaseConversationRepository(admin: SupabaseClient): ConversationRepository {
  return { ...signalQueries(admin), ...conversationReads(admin), ...otherReads(admin), ...conversationWrites(admin) };
}
