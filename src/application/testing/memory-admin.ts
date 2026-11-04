/**
 * In-memory `AdminConsoleRepository` for use-case tests. Models the contract
 * of the Supabase adapter: revision-guarded attempts, alias kept on reset,
 * an audit trail that survives the deletion of its target.
 */
import type { AdminUser, AdminUserPage, ReportStatus } from "@/contracts/admin";
import { err, ok } from "@/domain/shared";

import type { StorageError } from "../errors";
import type { AdminConsoleRepository, AdminCredential, AuditEntryInput } from "../admin";

const failed = err<StorageError>("storage.failed");

export function adminUser(id: string, patch: Partial<AdminUser> = {}): AdminUser {
  return {
    id, alias: `alias-${id.slice(0, 4)}`, animal: "Cervatillo", color: "Gris neblina", colorHex: "#888888", mbti: "INFP",
    createdAt: "2026-11-01T00:00:00.000Z", quizCompletedAt: "2026-11-01T00:10:00.000Z", paused: false, adult: true,
    modules: 0, isAdmin: false, hasChatPin: false, romanceMatches: 1, amistadMatches: 2, conversations: 0, reportsReceived: 0,
    ...patch,
  };
}

export class MemoryAdmin {
  readonly users = new Map<string, AdminUser>();
  readonly matriculas = new Map<string, string>();
  readonly credentials = new Map<string, AdminCredential>();
  readonly audit: AuditEntryInput[] = [];
  readonly reports = new Map<string, ReportStatus>();
  readonly reviewed: Array<{ adminId: string; reportId: string; status: string }> = [];
  failRead = false;
}

function listing(store: MemoryAdmin): Pick<AdminConsoleRepository, "listUsers" | "findUser" | "findAccount" | "isAdmin"> {
  return {
    async findAccount(matricula) {
      const id = store.matriculas.get(matricula);
      const user = id ? store.users.get(id) : undefined;
      return store.failRead ? failed : ok(user ? { userId: user.id, alias: user.alias } : null);
    },
    isAdmin: async (userId) => ok(store.users.get(userId)?.isAdmin ?? false),
    async listUsers({ search, limit, offset }): Promise<ReturnType<typeof ok<AdminUserPage>> | typeof failed> {
      if (store.failRead) return failed;
      const all = [...store.users.values()].filter((u) => (u.alias ?? "").toLowerCase().includes(search.toLowerCase()));
      return ok({ total: all.length, users: all.slice(offset, offset + limit) });
    },
    findUser: async (userId) => (store.failRead ? failed : ok(store.users.get(userId) ?? null)),
  };
}

function writes(store: MemoryAdmin): Omit<AdminConsoleRepository, "listUsers" | "findUser" | "findAccount" | "isAdmin" | "listAudit" | "listReports"> {
  const patch = (id: string, change: Partial<AdminUser>) => {
    const user = store.users.get(id);
    if (user) store.users.set(id, { ...user, ...change });
    return Boolean(user);
  };
  return {
    findCredential: async (userId) => ok(store.credentials.get(userId) ?? null),
    async updateAttempts(userId, revision, attempts) {
      const current = store.credentials.get(userId);
      if (!current || (revision !== null && current.revision !== revision)) return ok(false);
      store.credentials.set(userId, { ...current, attempts, revision: current.revision + 1 });
      return ok(true);
    },
    resetQuiz: async (id) =>
      ok(patch(id, { quizCompletedAt: null, animal: null, color: null, colorHex: null, mbti: null, modules: 0, romanceMatches: 0, amistadMatches: 0 })),
    async setPaused(id, paused) {
      patch(id, { paused });
      return ok(undefined);
    },
    resetChatPin: async (id) => ok(patch(id, { hasChatPin: false })),
    async deleteAccount(id) {
      store.users.delete(id);
      return ok(undefined);
    },
    async reviewReport(adminId, reportId, status) {
      if (!store.reports.has(reportId)) return ok(false);
      store.reports.set(reportId, status);
      store.reviewed.push({ adminId, reportId, status });
      return ok(true);
    },
    async recordAudit(entry) {
      store.audit.push(entry);
      return ok(undefined);
    },
  };
}

export function memoryAdminConsole(store: MemoryAdmin): AdminConsoleRepository {
  return {
    ...listing(store),
    ...writes(store),
    listReports: async () => ok({ total: 0, reports: [] }),
    listAudit: async (limit, offset) => ok({
      total: store.audit.length,
      entries: store.audit.slice(offset, offset + limit).map((e, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        adminAlias: e.adminAlias, action: e.action, targetAlias: e.targetAlias ?? null, detail: e.detail ?? {}, createdAt: "2026-11-03T00:00:00.000Z",
      })),
    }),
  };
}
