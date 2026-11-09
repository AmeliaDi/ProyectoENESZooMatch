/**
 * User control from the console (ADR-036). Every action is audited with the
 * target's alias captured BEFORE acting, so the trail survives a deletion.
 * Actions that change the pool republish the shared match set right away.
 */
import { ADMIN_CONFIG } from "@/config";
import { adminUserFilterSchema, type AdminAuditAction, type AdminAuditPage, type AdminReportPage, type AdminUserAction, type AdminUserFilter, type AdminUserPage, type ReportStatus } from "@/contracts/admin";
import { err, ok, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import { recomputeMatches } from "../recompute-matches";
import { auditAlias, type AdminActor, type AdminDeps } from "./ports";

export interface ActionOutcome {
  /** `true` when the shared match set could not be republished yet. */
  recomputePending: boolean;
}

const AUDIT_OF: Record<AdminUserAction, AdminAuditAction> = {
  reset_quiz: "reset_quiz",
  pause: "pause_user",
  resume: "resume_user",
  reset_chat_pin: "reset_chat_pin",
  delete: "delete_user",
};

/** Changes the pool, so matches are recomputed afterwards. */
const CHANGES_POOL: ReadonlySet<AdminUserAction> = new Set(["reset_quiz", "pause", "resume", "delete"]);

const clampPage = (page: number) => Math.max(0, Math.floor(page));

/**
 * Only the facets somebody actually chose. An untouched `<select>` arrives as
 * an empty string and means "todos", so it must not travel as a filter; the
 * parse at the end keeps the result inside the whitelist, so a facet out of
 * range here is a programming error and not a query.
 */
export function chosenFilter(filter: AdminUserFilter): AdminUserFilter {
  const picked: Record<string, string | boolean> = {};
  if (filter.estado) picked.estado = filter.estado;
  if (filter.pausado) picked.pausado = filter.pausado;
  if (filter.sinAfinidad) picked.sinAfinidad = filter.sinAfinidad;
  if (filter.soloAdmin) picked.soloAdmin = true;
  if (filter.mbti) picked.mbti = filter.mbti.toUpperCase();
  if (filter.orden) picked.orden = filter.orden;
  if (filter.desde) picked.desde = filter.desde;
  if (filter.hasta) picked.hasta = filter.hasta;
  return adminUserFilterSchema.parse(picked);
}

export function listUsers(
  search: string,
  page: number,
  filter: AdminUserFilter,
  deps: Pick<AdminDeps, "console">,
): Promise<Result<AdminUserPage, AppError>> {
  const limit = ADMIN_CONFIG.users.pageSize;
  const text = search.trim().slice(0, ADMIN_CONFIG.users.searchMaxChars);
  return deps.console.listUsers({
    search: text,
    limit,
    offset: clampPage(page) * limit,
    filter: chosenFilter(filter),
  });
}

async function apply(action: AdminUserAction, userId: string, deps: AdminDeps): Promise<Result<void, AppError>> {
  switch (action) {
    case "reset_quiz": {
      const done = await deps.console.resetQuiz(userId);
      return done.ok ? (done.value ? ok(undefined) : err("admin.not_found")) : done;
    }
    case "pause":
    case "resume":
      return deps.console.setPaused(userId, action === "pause");
    case "reset_chat_pin": {
      const done = await deps.console.resetChatPin(userId);
      return done.ok ? ok(undefined) : done;
    }
    case "delete":
      return deps.console.deleteAccount(userId);
  }
}

export async function runUserAction(
  actor: AdminActor,
  userId: string,
  action: AdminUserAction,
  deps: AdminDeps,
): Promise<Result<ActionOutcome, AppError>> {
  const target = await deps.console.findUser(userId);
  if (!target.ok) return target;
  if (!target.value) return err("admin.not_found");
  if (action === "delete" && (target.value.isAdmin || userId === actor.userId)) return err("admin.protected");
  const done = await apply(action, userId, deps);
  if (!done.ok) return done;
  await deps.console.recordAudit({
    adminId: actor.userId,
    adminAlias: auditAlias(actor.identity),
    action: AUDIT_OF[action],
    targetUser: userId,
    targetAlias: auditAlias(target.value.identity),
  });
  if (!CHANGES_POOL.has(action)) return ok({ recomputePending: false });
  const recomputed = await recomputeMatches(deps);
  return ok({ recomputePending: !recomputed.ok });
}

export async function recomputeAudited(actor: AdminActor, deps: AdminDeps): Promise<Result<{ pairs: number }, AppError>> {
  const pairs = await recomputeMatches(deps);
  if (!pairs.ok) return pairs;
  await deps.console.recordAudit({
    adminId: actor.userId,
    adminAlias: auditAlias(actor.identity),
    action: "recompute",
    detail: { pairs: pairs.value.length },
  });
  return ok({ pairs: pairs.value.length });
}

export function listReports(
  status: ReportStatus | null,
  page: number,
  deps: Pick<AdminDeps, "console">,
): Promise<Result<AdminReportPage, AppError>> {
  const limit = ADMIN_CONFIG.reports.pageSize;
  return deps.console.listReports(status, limit, clampPage(page) * limit);
}

export async function reviewReport(
  actor: AdminActor,
  reportId: string,
  status: Exclude<ReportStatus, "abierto">,
  deps: Pick<AdminDeps, "console">,
): Promise<Result<void, AppError>> {
  const done = await deps.console.reviewReport(actor.userId, reportId, status);
  if (!done.ok) return done;
  if (!done.value) return err("admin.not_found");
  await deps.console.recordAudit({
    adminId: actor.userId,
    adminAlias: auditAlias(actor.identity),
    action: status === "revisado" ? "report_revisado" : "report_cerrado",
    detail: { report: reportId },
  });
  return ok(undefined);
}

export function listAudit(page: number, deps: Pick<AdminDeps, "console">): Promise<Result<AdminAuditPage, AppError>> {
  const limit = ADMIN_CONFIG.audit.pageSize;
  return deps.console.listAudit(limit, clampPage(page) * limit);
}
