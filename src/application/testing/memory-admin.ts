/**
 * In-memory `AdminConsoleRepository` for use-case tests. Models the contract
 * of the Supabase adapter: revision-guarded attempts, the identity kept
 * frozen across a quiz reset, an audit trail that survives the deletion of
 * its target, and the same facet reading the stored whitelist does.
 */
import type { AdminOrder, AdminUser, AdminUserFilter, AdminUserPage, CounterState, ReportStatus } from "@/contracts/admin";
import type { IdentityDto } from "@/contracts/identity";
import { err, ok } from "@/domain/shared";

import type { StorageError } from "../errors";
import type { AdminConsoleRepository, AdminCredential, AuditEntryInput } from "../admin";
import { auditAlias } from "../admin";

const failed = err<StorageError>("storage.failed");
const DAY_MS = 86_400_000;
const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Identity as it would sit in the row after eclosion; nothing is computed here. */
export function hatchedIdentity(patch: Partial<IdentityDto> = {}): IdentityDto {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "cervatillo gris neblina · KMPQ",
    aliasAnimal: "cervatillo",
    aliasColor: "gris neblina",
    aliasSufijo: "KMPQ",
    animalId: "cervatillo",
    colorId: "gris-neblina",
    colorHex: "#888888",
    mbtiCode: "INFP",
    enneagramCode: "4w5",
    enneagramName: "El individuo",
    mark: "sp",
    revelacionVista: true,
    huevitoSeed: null,
    ...patch,
  };
}

export function adminUser(id: string, patch: Partial<AdminUser> = {}): AdminUser {
  // An egg has no hatching date: the harness keeps that pair consistent, the
  // way the stored row does, instead of trusting whatever the test pasted.
  const identity = patch.identity ?? hatchedIdentity();
  return {
    id,
    identity,
    createdAt: "2026-11-01T00:00:00.000Z",
    quizCompletedAt: "2026-11-01T00:10:00.000Z",
    eclosionadoEn: identity.estadoIdentidad === "huevo" ? null : "2026-11-01T00:10:00.000Z",
    eliminadoEn: null,
    paused: false, adult: true,
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
  /** Manual tallies: a key nobody has moved has no row, as in the table. */
  readonly counters = new Map<string, number>();
  failRead = false;
}

/**
 * The facets of the stored listing with its whitelist: a value outside the
 * set the base accepts filters nothing there, so it filters nothing here.
 */
function matchesFilter(user: AdminUser, filter: AdminUserFilter): boolean {
  if (filter.estado && user.identity.estadoIdentidad !== filter.estado) return false;
  if (filter.mbti && (user.identity.mbtiCode ?? "").toUpperCase() !== filter.mbti.toUpperCase()) return false;
  if (filter.pausado && user.paused !== (filter.pausado === "si")) return false;
  if (filter.soloAdmin && !user.isAdmin) return false;
  // The base asks `live_pairs`; the harness holds no pairs, so the per-track
  // count is its stand-in and a person with none is the only one that stays.
  if (filter.sinAfinidad === "romance" && user.romanceMatches > 0) return false;
  if (filter.sinAfinidad === "amistad" && user.amistadMatches > 0) return false;
  const at = Date.parse(user.createdAt);
  if (filter.desde && at < dayStart(filter.desde)) return false;
  if (filter.hasta && at >= dayStart(filter.hasta) + DAY_MS) return false;
  return true;
}

const afinidades = (user: AdminUser) => user.romanceMatches + user.amistadMatches;
/** The id last, so a tie keeps the same page across offsets. */
const byDate = (a: AdminUser, b: AdminUser) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);

const compares: Record<AdminOrder, (a: AdminUser, b: AdminUser) => number> = {
  recientes: byDate,
  antiguas: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  nombre: (a, b) => {
    // `lower(alias_completo) ASC NULLS LAST`: an egg with no name goes last,
    // where the base puts it, instead of becoming the empty first letter.
    const x = a.identity.aliasCompleto?.toLowerCase();
    const y = b.identity.aliasCompleto?.toLowerCase();
    if (x === undefined) return y === undefined ? byDate(a, b) : 1;
    if (y === undefined) return -1;
    return x.localeCompare(y) || byDate(a, b);
  },
  masAfinidades: (a, b) => afinidades(b) - afinidades(a) || byDate(a, b),
  menosAfinidades: (a, b) => afinidades(a) - afinidades(b) || byDate(a, b),
};

function listing(store: MemoryAdmin): Pick<AdminConsoleRepository, "listUsers" | "findUser" | "findAccount" | "isAdmin"> {
  return {
    async findAccount(matricula) {
      const id = store.matriculas.get(matricula);
      const user = id ? store.users.get(id) : undefined;
      return store.failRead ? failed : ok(user ? { userId: user.id, identity: user.identity } : null);
    },
    isAdmin: async (userId) => ok(store.users.get(userId)?.isAdmin ?? false),
    async listUsers({ search, limit, offset, filter }): Promise<ReturnType<typeof ok<AdminUserPage>> | typeof failed> {
      if (store.failRead) return failed;
      const needle = search.toLowerCase();
      const all = [...store.users.values()].filter((u) =>
        (u.identity.aliasCompleto ?? "").toLowerCase().includes(needle) && matchesFilter(u, filter),
      );
      all.sort(compares[filter.orden ?? "recientes"]);
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
    // Eclosion happens once: a reset clears the readings and the affinities,
    // never the identity already fixed on the row.
    resetQuiz: async (id) =>
      ok(patch(id, { quizCompletedAt: null, modules: 0, romanceMatches: 0, amistadMatches: 0 })),
    async setPaused(id, paused) {
      patch(id, { paused });
      return ok(undefined);
    },
    resetChatPin: async (id) => ok(patch(id, { hasChatPin: false })),
    // The clamp and the trail live in the stored function, so this mirrors
    // both: a use case that also wrote an audit row would show as a double one.
    async bumpCounter(adminId, move): Promise<ReturnType<typeof ok<CounterState>> | typeof failed> {
      const antes = store.counters.get(move.key) ?? 0;
      const value = move.set ?? Math.max(0, antes + (move.delta ?? 0));
      store.counters.set(move.key, value);
      const actor = store.users.get(adminId);
      store.audit.push({
        adminId,
        adminAlias: actor ? auditAlias(actor.identity) : null,
        action: "counter_update",
        detail: { key: move.key, antes, despues: value, delta: move.delta ?? value - antes },
      });
      return ok({ key: move.key, value, antes });
    },
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
