/**
 * Ports of the admin console (ADR-036). The adapter runs with the service
 * role, so every use case here must be reached only after the route checked
 * the admin session.
 */
import type {
  AdminAuditAction,
  AdminAuditPage,
  AdminReportPage,
  AdminUser,
  AdminUserPage,
  ReportStatus,
} from "@/contracts/admin";
import type { Clock, Result } from "@/domain/shared";

import type { StorageError } from "../errors";
import type { PinDigest, PinHasher } from "../ports";
import type { RecomputeDeps } from "../recompute-matches";

export interface AdminAttempts {
  failedAttempts: number;
  pauseStep: number;
  lockedUntil: Date | null;
}

export interface AdminCredential {
  digest: PinDigest;
  attempts: AdminAttempts;
  /** Compare-and-swap token, bumped by every write. */
  revision: number;
}

export interface AdminAccount {
  userId: string;
  alias: string | null;
}

export interface AuditEntryInput {
  adminId: string | null;
  adminAlias: string | null;
  action: AdminAuditAction;
  targetUser?: string;
  targetAlias?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

export interface UserQuery {
  search: string;
  limit: number;
  offset: number;
}

export interface AdminConsoleRepository {
  /** Account of a matrícula (compared as HMAC digest); `null` when unknown. */
  findAccount(matricula: string): Promise<Result<AdminAccount | null, StorageError>>;
  isAdmin(userId: string): Promise<Result<boolean, StorageError>>;
  findCredential(userId: string): Promise<Result<AdminCredential | null, StorageError>>;
  /** Applies only if the revision still matches (`null` = unconditional); `false` on a lost race. */
  updateAttempts(userId: string, revision: number | null, attempts: AdminAttempts): Promise<Result<boolean, StorageError>>;
  listUsers(query: UserQuery): Promise<Result<AdminUserPage, StorageError>>;
  findUser(userId: string): Promise<Result<AdminUser | null, StorageError>>;
  resetQuiz(userId: string): Promise<Result<boolean, StorageError>>;
  setPaused(userId: string, paused: boolean): Promise<Result<void, StorageError>>;
  resetChatPin(userId: string): Promise<Result<boolean, StorageError>>;
  deleteAccount(userId: string): Promise<Result<void, StorageError>>;
  listReports(status: ReportStatus | null, limit: number, offset: number): Promise<Result<AdminReportPage, StorageError>>;
  reviewReport(adminId: string, reportId: string, status: Exclude<ReportStatus, "abierto">): Promise<Result<boolean, StorageError>>;
  recordAudit(entry: AuditEntryInput): Promise<Result<void, StorageError>>;
  listAudit(limit: number, offset: number): Promise<Result<AdminAuditPage, StorageError>>;
}

export interface AdminDeps extends RecomputeDeps {
  console: AdminConsoleRepository;
}

export interface AdminLoginDeps {
  console: AdminConsoleRepository;
  hasher: PinHasher;
  clock: Clock;
}

/** The admin acting, as resolved from the console session. */
export interface AdminActor {
  userId: string;
  alias: string | null;
}
