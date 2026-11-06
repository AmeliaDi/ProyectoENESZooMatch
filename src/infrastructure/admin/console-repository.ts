/**
 * Supabase adapter of `AdminConsoleRepository` (service role). Reached only
 * after `requireAdmin` (or by the login use case). `pin_hash`/`salt` never
 * leave this file; listings come from RPCs that omit hashes, answers and θ.
 */
import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AdminAttempts, AdminConsoleRepository, AuditEntryInput } from "@/application/admin";
import { toIdentityDto } from "@/application/identity-dto";
import { adminAuditEntrySchema, adminReportPageSchema, adminUserPageSchema } from "@/contracts/admin";
import { ok } from "@/domain/shared";
import { hashMatricula } from "@/infrastructure/auth/identity.server";
import { RPC, TABLE, attempt, failed } from "@/infrastructure/supabase/shared";

const date = z.string().transform((value) => new Date(value));
/**
 * The identity as it is stored. `alias_completo` is the only name column and
 * it is read as written on eclosion — the console never assembles a name.
 */
const IDENTITY_COLUMNS =
  "user_id, matricula_hash, estado_identidad, alias_completo, alias_animal, alias_color, alias_sufijo, animal_id, color_id, mbti_code, enneagram_code, avatar_mark, revelacion_vista";
const credentialSchema = z.object({
  pin_hash: z.string(),
  salt: z.string(),
  kdf_params: z.object({ algorithm: z.literal("scrypt"), log2N: z.number().int(), r: z.number().int(), p: z.number().int(), keyLen: z.number().int() }),
  failed_attempts: z.number().int(),
  pause_step: z.number().int(),
  locked_until: date.nullable(),
  revision: z.number().int(),
});
const accountRowSchema = z.object({
  user_id: z.string(),
  matricula_hash: z.string(),
  estado_identidad: z.enum(["huevo", "eclosionado"]).catch("huevo"),
  alias_completo: z.string().nullable().catch(null),
  alias_animal: z.string().nullable().catch(null),
  alias_color: z.string().nullable().catch(null),
  alias_sufijo: z.string().nullable().catch(null),
  animal_id: z.string().nullable().catch(null),
  color_id: z.string().nullable().catch(null),
  mbti_code: z.string().nullable().catch(null),
  enneagram_code: z.string().nullable().catch(null),
  avatar_mark: z.enum(["sp", "so", "sx"]).nullable().catch(null),
  revelacion_vista: z.boolean().catch(false),
});
const auditRowSchema = z.object({
  id: z.string(),
  admin_alias: z.string().nullable(),
  action: z.string(),
  target_alias: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

const attemptsRow = (a: AdminAttempts) => ({
  failed_attempts: a.failedAttempts,
  pause_step: a.pauseStep,
  locked_until: a.lockedUntil ? a.lockedUntil.toISOString() : null,
});

function auditRow(entry: AuditEntryInput) {
  return {
    admin_id: entry.adminId,
    admin_alias: entry.adminAlias,
    action: entry.action,
    target_user: entry.targetUser ?? null,
    target_alias: entry.targetAlias ?? null,
    detail: entry.detail ?? {},
  };
}

function account(admin: SupabaseClient, secret: string): Pick<AdminConsoleRepository, "findAccount" | "isAdmin"> {
  return {
    async findAccount(matricula) {
      const digest = hashMatricula(matricula, secret);
      const res = await attempt(() =>
        admin.from(TABLE.profiles).select(IDENTITY_COLUMNS).eq("matricula_hash", digest).maybeSingle(),
      );
      if (!res || res.error) return failed;
      if (!res.data) return ok(null);
      const parsed = accountRowSchema.safeParse(res.data);
      if (!parsed.success) return failed;
      const row = parsed.data;
      const same = row.matricula_hash.length === digest.length && timingSafeEqual(Buffer.from(row.matricula_hash), Buffer.from(digest));
      if (!same) return ok(null);
      // Only the name of the audit row needs projecting; the narrative and the
      // quiz date are not columns of this read and never reach the console.
      return ok({
        userId: row.user_id,
        identity: toIdentityDto({
          estadoIdentidad: row.estado_identidad,
          aliasCompleto: row.alias_completo,
          aliasAnimal: row.alias_animal,
          aliasColor: row.alias_color,
          aliasSufijo: row.alias_sufijo,
          animalId: row.animal_id,
          colorId: row.color_id,
          mbtiCode: row.mbti_code,
          enneagramCode: row.enneagram_code,
          narrative: null,
          mark: row.avatar_mark,
          revelacionVista: row.revelacion_vista,
          quizCompletedAt: null,
        }),
      });
    },
    async isAdmin(userId) {
      const res = await attempt(() => admin.from(TABLE.roles).select("role").eq("user_id", userId).eq("role", "admin").maybeSingle());
      return res && !res.error ? ok(res.data?.role === "admin") : failed;
    },
  };
}

function credentials(admin: SupabaseClient): Pick<AdminConsoleRepository, "findCredential" | "updateAttempts"> {
  return {
    async findCredential(userId) {
      const columns = "pin_hash, salt, kdf_params, failed_attempts, pause_step, locked_until, revision";
      const res = await attempt(() => admin.from(TABLE.adminCredentials).select(columns).eq("user_id", userId).maybeSingle());
      if (!res || res.error) return failed;
      if (!res.data) return ok(null);
      const row = credentialSchema.safeParse(res.data);
      if (!row.success) return failed;
      const r = row.data;
      return ok({
        digest: { hash: r.pin_hash, salt: r.salt, params: r.kdf_params },
        attempts: { failedAttempts: r.failed_attempts, pauseStep: r.pause_step, lockedUntil: r.locked_until },
        revision: r.revision,
      });
    },
    async updateAttempts(userId, revision, attempts) {
      const res = await attempt(() => {
        const query = admin.from(TABLE.adminCredentials).update(attemptsRow(attempts)).eq("user_id", userId);
        return (revision === null ? query : query.eq("revision", revision)).select("user_id");
      });
      return res && !res.error ? ok((res.data?.length ?? 0) > 0) : failed;
    },
  };
}

function users(admin: SupabaseClient): Pick<AdminConsoleRepository, "listUsers" | "findUser" | "resetQuiz" | "setPaused" | "resetChatPin" | "deleteAccount"> {
  const page = async (search: string, user: string | null, limit: number, offset: number) => {
    const res = await attempt(() => admin.rpc(RPC.adminListUsers, { p_search: search, p_user: user, p_limit: limit, p_offset: offset }));
    if (!res || res.error) return null;
    const parsed = adminUserPageSchema.safeParse(res.data);
    return parsed.success ? parsed.data : null;
  };
  return {
    async listUsers({ search, limit, offset }) {
      const found = await page(search, null, limit, offset);
      return found ? ok(found) : failed;
    },
    async findUser(userId) {
      const found = await page("", userId, 1, 0);
      return found ? ok(found.users[0] ?? null) : failed;
    },
    async resetQuiz(userId) {
      const res = await attempt(() => admin.rpc(RPC.adminResetQuiz, { p_user: userId }));
      return res && !res.error ? ok(res.data === true) : failed;
    },
    async setPaused(userId, paused) {
      const res = await attempt(() =>
        admin.from(TABLE.profiles).update({ paused_at: paused ? new Date().toISOString() : null }).eq("user_id", userId),
      );
      return res && !res.error ? ok(undefined) : failed;
    },
    async resetChatPin(userId) {
      const res = await attempt(() => admin.from(TABLE.chatPins).delete().eq("user_id", userId).select("user_id"));
      return res && !res.error ? ok((res.data?.length ?? 0) > 0) : failed;
    },
    async deleteAccount(userId) {
      const res = await attempt(() => admin.auth.admin.deleteUser(userId));
      return res && !res.error ? ok(undefined) : failed;
    },
  };
}

function moderation(admin: SupabaseClient): Pick<AdminConsoleRepository, "listReports" | "reviewReport" | "recordAudit" | "listAudit"> {
  return {
    async listReports(status, limit, offset) {
      const res = await attempt(() => admin.rpc(RPC.adminListReports, { p_status: status, p_limit: limit, p_offset: offset }));
      if (!res || res.error) return failed;
      const parsed = adminReportPageSchema.safeParse(res.data);
      return parsed.success ? ok(parsed.data) : failed;
    },
    async reviewReport(adminId, reportId, status) {
      const res = await attempt(() => admin.rpc(RPC.adminReviewReport, { p_admin: adminId, p_report: reportId, p_status: status }));
      return res && !res.error ? ok(res.data === true) : failed;
    },
    async recordAudit(entry) {
      const res = await attempt(() => admin.from(TABLE.adminAudit).insert(auditRow(entry)));
      return res && !res.error ? ok(undefined) : failed;
    },
    async listAudit(limit, offset) {
      const columns = "id, admin_alias, action, target_alias, detail, created_at";
      const res = await attempt(() =>
        admin.from(TABLE.adminAudit).select(columns, { count: "exact" })
          .order("created_at", { ascending: false }).range(offset, offset + limit - 1),
      );
      if (!res || res.error) return failed;
      const rows = z.array(auditRowSchema).safeParse(res.data ?? []);
      if (!rows.success) return failed;
      const entries = z.array(adminAuditEntrySchema).safeParse(rows.data.map((r) => ({
        id: r.id, adminAlias: r.admin_alias, action: r.action, targetAlias: r.target_alias, detail: r.detail, createdAt: r.created_at,
      })));
      return entries.success ? ok({ total: res.count ?? entries.data.length, entries: entries.data }) : failed;
    },
  };
}

export function supabaseAdminConsoleRepository(admin: SupabaseClient, secret: string): AdminConsoleRepository {
  return { ...account(admin, secret), ...credentials(admin), ...users(admin), ...moderation(admin) };
}
