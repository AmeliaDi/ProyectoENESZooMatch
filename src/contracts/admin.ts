/**
 * Admin console contract (ADR-036). Rows carry the pseudonymous account id
 * (needed to act on it), the identity frozen at hatching and counts. Never a
 * matrícula, its hash, answers, vectors, θ, hard filters or chat content
 * outside a report snapshot.
 */
import { z } from "zod";

import { REPORT_REASONS } from "./chat";
import type { IdentityDto } from "./identity";

const isoDate = z.string().min(1);
const count = z.number().int().min(0);
/** Same ceiling as the stored `alias_completo`; a longer text is not an alias. */
const word = z.string().max(64);
const catalogueId = z.string().max(40);

/**
 * The identity of one person as the console receives it: the projection of
 * the stored columns, never a name assembled here. `satisfies` keeps it glued
 * to `IdentityDto`, so a field added to the wire contract breaks this file.
 */
export const identitySchema = z.object({
  estadoIdentidad: z.enum(["huevo", "eclosionado"]),
  aliasCompleto: word.nullable(),
  aliasAnimal: word.nullable(),
  aliasColor: word.nullable(),
  aliasSufijo: z.string().max(8).nullable(),
  animalId: catalogueId.nullable(),
  colorId: catalogueId.nullable(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  mbtiCode: z.string().max(4).nullable(),
  enneagramCode: z.string().max(3).nullable(),
  // Kind words of the enneagram are read from the catalogue, not stored.
  enneagramName: word.nullable().default(null),
  mark: z.enum(["sp", "so", "sx"]).nullable(),
  revelacionVista: z.boolean(),
  // The shell seed needs the server secret, so the console never holds it.
  huevitoSeed: z.number().int().min(0).nullable().default(null),
}) satisfies z.ZodType<IdentityDto>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  identity: identitySchema,
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
export const adminSessionSchema = z.object({ identity: identitySchema });
export type AdminSessionDto = z.infer<typeof adminSessionSchema>;

/** Actions the user detail offers; each one is audited. */
export const ADMIN_USER_ACTIONS = ["reset_quiz", "pause", "resume", "reset_chat_pin", "delete"] as const;
export type AdminUserAction = (typeof ADMIN_USER_ACTIONS)[number];
