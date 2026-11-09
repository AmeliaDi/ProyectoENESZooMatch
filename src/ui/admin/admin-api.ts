/**
 * Console client. Every payload is validated against the shared contract
 * before it reaches a component; 401/403 surface as `"unauthorized"` so the
 * console can send the person back to `/admin/login`.
 */
import type { z } from "zod";

import {
  adminAuditPageSchema,
  adminReportPageSchema,
  adminSessionSchema,
  adminUserPageSchema,
  counterStateSchema,
  type AdminSessionDto,
  type AdminUser,
  type AdminUserAction,
  type AdminUserFilter,
  type AdminUserPage,
  type CounterMove,
  type ReportStatus,
} from "@/contracts/admin";
import { parseAdminMetrics, type AdminMetrics } from "@/contracts/admin-metrics";
import { parseIdentity } from "@/ui/shared/parse-identity";

const TIMEOUT_MS = 15000;
const LONG_TIMEOUT_MS = 120000;
const AUTH_STATUSES = new Set([401, 403]);

export type ApiResult<T> = { ok: true; value: T } | { ok: false; reason: "unauthorized" | "failed"; message?: string };

async function call<T>(path: string, parse: (raw: unknown) => T | null, init: RequestInit = {}, timeout = TIMEOUT_MS): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(timeout), ...init });
    if (AUTH_STATUSES.has(response.status)) return { ok: false, reason: "unauthorized" };
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : undefined;
      return { ok: false, reason: "failed", ...(message ? { message } : {}) };
    }
    const value = parse(body);
    return value === null ? { ok: false, reason: "failed" } : { ok: true, value };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

const using = <S extends z.ZodType>(schema: S) => (raw: unknown): z.output<S> | null => {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};
const okOnly = (raw: unknown) => (raw && typeof raw === "object" ? true : null);

/**
 * Identity goes through `parseIdentity` and nowhere else: a row without a
 * complete frozen identity arrives as an egg, never as a half-built name.
 */
const withStoredIdentity = (user: AdminUser): AdminUser => ({ ...user, identity: parseIdentity(user.identity) });

const readUserPage = (raw: unknown): AdminUserPage | null => {
  const parsed = adminUserPageSchema.safeParse(raw);
  return parsed.success ? { total: parsed.data.total, users: parsed.data.users.map(withStoredIdentity) } : null;
};

const readSession = (raw: unknown): AdminSessionDto | null => {
  const parsed = adminSessionSchema.safeParse(raw);
  return parsed.success ? { identity: parseIdentity(parsed.data.identity) } : null;
};

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * A facet list becomes a query string the console can also paste as a link.
 * Only chosen facets travel and `soloAdmin` keeps the word the route expects;
 * an untouched select is "todos", which is the absence of a parameter.
 */
function filterParams(filter: AdminUserFilter): Record<string, string> {
  const wire: Record<string, string> = {};
  if (filter.estado) wire.estado = filter.estado;
  if (filter.pausado) wire.pausado = filter.pausado;
  if (filter.sinAfinidad) wire.sinAfinidad = filter.sinAfinidad;
  if (filter.soloAdmin) wire.soloAdmin = "si";
  if (filter.mbti) wire.mbti = filter.mbti;
  if (filter.orden) wire.orden = filter.orden;
  if (filter.desde) wire.desde = filter.desde;
  if (filter.hasta) wire.hasta = filter.hasta;
  return wire;
}

export const adminApi = {
  session: () => call("/api/admin/session", readSession),
  metrics: (days?: number) =>
    call<AdminMetrics>(days === undefined ? "/api/admin/metrics" : `/api/admin/metrics?${new URLSearchParams({ days: String(days) })}`, parseAdminMetrics),
  /** One manual tally move; the answer is the value the base kept, and the one it replaced. */
  counterMove: (move: CounterMove) => call("/api/admin/counters", using(counterStateSchema), post(move)),
  users: (q: string, page: number, filter: AdminUserFilter = {}) =>
    call(`/api/admin/users?${new URLSearchParams({ q, page: String(page), ...filterParams(filter) })}`, readUserPage),
  userAction: (id: string, action: AdminUserAction) =>
    call(`/api/admin/users/${encodeURIComponent(id)}`, (raw) => (raw && typeof raw === "object" ? raw : null), post({ action }), LONG_TIMEOUT_MS),
  reports: (status: ReportStatus, page: number) =>
    call(`/api/admin/reports?${new URLSearchParams({ status, page: String(page) })}`, using(adminReportPageSchema)),
  reviewReport: (id: string, status: Exclude<ReportStatus, "abierto">) =>
    call(`/api/admin/reports/${encodeURIComponent(id)}`, okOnly, post({ status })),
  audit: (page: number) => call(`/api/admin/audit?page=${page}`, using(adminAuditPageSchema)),
  recompute: () => call("/api/admin/recompute", okOnly, { method: "POST" }, LONG_TIMEOUT_MS),
  logout: () => call("/api/admin/logout", okOnly, { method: "POST" }),
};
