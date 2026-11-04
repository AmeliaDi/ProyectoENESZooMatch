/**
 * Admin console contract (ADR-036). Rows carry the pseudonymous account id
 * (needed to act on it), the alias and counts. Never a matrícula, its hash,
 * answers, vectors, θ, hard filters or chat content outside a report snapshot.
 */
import { z } from "zod";

import { REPORT_REASONS } from "./chat";

const isoDate = z.string().min(1);
const count = z.number().int().min(0);

export const adminUserSchema = z.object({
  id: z.uuid(),
  alias: z.string().nullable(),
  animal: z.string().nullable(),
  color: z.string().nullable(),
  colorHex: z.string().nullable(),
  mbti: z.string().nullable(),
  createdAt: isoDate,
  quizCompletedAt: isoDate.nullable(),
  paused: z.boolean(),
  adult: z.boolean(),
  modules: count,
  isAdmin: z.boolean(),
  hasChatPin: z.boolean(),
  romanceMatches: count,
  amistadMatches: count,
  conversations: count,
  reportsReceived: count,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserPageSchema = z.object({ total: count, users: z.array(adminUserSchema) });
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

export const REPORT_STATUSES = ["abierto", "revisado", "cerrado"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const snapshotEntrySchema = z.object({
  who: z.enum(["reporta", "reportada"]),
  kind: z.string(),
  body: z.string(),
  at: z.string(),
});

export const adminReportSchema = z.object({
  id: z.uuid(),
  reporterAlias: z.string().nullable(),
  reportedId: z.uuid(),
  reportedAlias: z.string().nullable(),
  track: z.enum(["romance", "amistad"]),
  reason: z.enum(REPORT_REASONS),
  status: z.enum(REPORT_STATUSES),
  snapshot: z.array(snapshotEntrySchema),
  createdAt: isoDate,
  reviewedAt: isoDate.nullable(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminReportPageSchema = z.object({ total: count, reports: z.array(adminReportSchema) });
export type AdminReportPage = z.infer<typeof adminReportPageSchema>;

export const ADMIN_AUDIT_ACTIONS = [
  "login", "login_failed", "logout", "delete_user", "reset_quiz", "pause_user", "resume_user",
  "reset_chat_pin", "recompute", "report_revisado", "report_cerrado",
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const adminAuditEntrySchema = z.object({
  id: z.uuid(),
  adminAlias: z.string().nullable(),
  action: z.enum(ADMIN_AUDIT_ACTIONS),
  targetAlias: z.string().nullable(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: isoDate,
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditPageSchema = z.object({ total: count, entries: z.array(adminAuditEntrySchema) });
export type AdminAuditPage = z.infer<typeof adminAuditPageSchema>;

/** Who is signed in to the console (shown in the header). */
export const adminSessionSchema = z.object({ alias: z.string().nullable() });
export type AdminSessionDto = z.infer<typeof adminSessionSchema>;

/** Actions the user detail offers; each one is audited. */
export const ADMIN_USER_ACTIONS = ["reset_quiz", "pause", "resume", "reset_chat_pin", "delete"] as const;
export type AdminUserAction = (typeof ADMIN_USER_ACTIONS)[number];
