/**
 * In-memory adapters for use-case tests. They model the observable contract
 * of the Supabase repositories (pool-size guard, notify-clears-unread) without
 * any network.
 */
import { CATALOG_ANIMALS, CATALOG_COLORS } from "@/config";
import { normalizeMatchPairs, type GlobalMatch } from "@/domain/matching";
import { clearAttempts } from "@/domain/chat";
import { enneagramCodeOf, type HatchedIdentity } from "@/domain/identity/hatch-identity";
import { err, ok } from "@/domain/shared";
import type { ShareLayerId } from "@/types/sharing";

import type { StorageError } from "../errors";
import type {
  ChatPinRecord,
  ChatPinRepository,
  ChatSecurityEvent,
  CounterpartProfile,
  HatchOutcome,
  IdentityRecord,
  MatriculaVerifier,
  PinHasher,
  MatchRepository,
  NotificationRecord,
  NotificationRepository,
  OwnProfile,
  PoolProfile,
  ProfileRepository,
  QuizResultRecord,
  StoredMatch,
} from "../ports";

export interface Faults {
  save?: boolean;
  pool?: boolean;
  notify?: boolean;
}

export class MemoryStore {
  readonly results = new Map<string, QuizResultRecord>();
  /** Stored identity — the only source names are read from, like the DB columns. */
  readonly identities = new Map<string, IdentityRecord>();
  readonly inclusiveModes = new Map<string, string>();
  readonly paused = new Set<string>();
  readonly showDetail = new Set<string>();
  readonly sharedLayers = new Map<string, ShareLayerId[]>();
  matches: GlobalMatch[] = [];
  readonly notifications: Array<NotificationRecord & { userId: string }> = [];
  readonly notified: string[] = [];
  /** Bumped by every save; models max(quiz_completed_at) + count. */
  version = 0;
  /** Number of upcoming replace attempts that see a concurrent submission. */
  concurrentArrivals = 0;
  faults: Faults = {};
  viewer = "";
  own: OwnProfile | null = null;
  counterparts: CounterpartProfile[] = [];
  stored: StoredMatch[] = [];
  /** chat_pins / chat_security_events; cascade from the account like in SQL. */
  readonly chatPins = new Map<string, ChatPinRecord>();
  readonly chatEvents: Array<ChatSecurityEvent & { userId: string }> = [];
  /** Matrícula per account (the real adapter compares HMAC digests). */
  readonly matriculas = new Map<string, string>();

  /** Only hatched and not paused people take part in matching. */
  pool(): PoolProfile[] {
    return [...this.results.values()]
      .filter((r) => !this.paused.has(r.userId))
      .filter((r) => this.identities.get(r.userId)?.estadoIdentidad === "eclosionado")
      .map((r) => ({ userId: r.userId, profile: r.scored }));
  }
}

const failed = err<StorageError>("storage.failed");

const FIXED_AT = "2026-10-31T00:00:00.000Z";

function eggIdentity(): IdentityRecord {
  return {
    estadoIdentidad: "huevo",
    aliasCompleto: null,
    aliasAnimal: null,
    aliasColor: null,
    aliasSufijo: null,
    animalId: null,
    colorId: null,
    mbtiCode: null,
    enneagramCode: null,
    narrative: null,
    mark: null,
    revelacionVista: false,
    quizCompletedAt: null,
  };
}

/** Mirrors `hatch_profile_identity`: one write, then frozen forever. */
function freeze(store: MemoryStore, userId: string, hatch: HatchedIdentity): HatchOutcome {
  const current = store.identities.get(userId);
  if (current?.estadoIdentidad === "eclosionado") {
    return { outcome: "already", aliasCompleto: current.aliasCompleto ?? "", estadoIdentidad: "eclosionado" };
  }
  const taken = [...store.identities.entries()]
    .some(([other, record]) => other !== userId && record.aliasCompleto === hatch.aliasCompleto);
  if (taken) {
    return { outcome: "collision", aliasCompleto: hatch.aliasCompleto, estadoIdentidad: "huevo" };
  }
  store.identities.set(userId, {
    estadoIdentidad: "eclosionado",
    aliasCompleto: hatch.aliasCompleto,
    aliasAnimal: hatch.aliasAnimal,
    aliasColor: hatch.aliasColor,
    aliasSufijo: hatch.aliasSufijo,
    animalId: hatch.animalId,
    colorId: hatch.colorId,
    mbtiCode: hatch.mbtiCode,
    enneagramCode: enneagramCodeOf(hatch.enneagram),
    narrative: hatch.narrative,
    mark: hatch.mark,
    revelacionVista: false,
    quizCompletedAt: FIXED_AT,
  });
  return { outcome: "written", aliasCompleto: hatch.aliasCompleto, estadoIdentidad: "eclosionado" };
}

function outcomeOf(store: MemoryStore, userId: string): HatchOutcome {
  const record = store.identities.get(userId);
  if (!record || record.estadoIdentidad === "huevo") {
    return { outcome: "already", aliasCompleto: "", estadoIdentidad: "huevo" };
  }
  return { outcome: "already", aliasCompleto: record.aliasCompleto ?? "", estadoIdentidad: "eclosionado" };
}

export function memoryProfiles(store: MemoryStore): ProfileRepository {
  return {
    isQuizCompleted: async (userId) => ok(store.results.has(userId)),
    privacyState: async (userId) =>
      ok({ paused: store.paused.has(userId), showAvatarDetail: store.showDetail.has(userId), sharedLayers: [...(store.sharedLayers.get(userId) ?? [])] }),
    async setSharedLayers(userId, layers) {
      if (store.faults.save) return failed;
      store.sharedLayers.set(userId, [...layers]);
      return ok(undefined);
    },
    async setShowAvatarDetail(userId, show) {
      if (store.faults.save) return failed;
      if (show) store.showDetail.add(userId);
      else store.showDetail.delete(userId);
      return ok(undefined);
    },
    async identityState(userId) {
      return ok(store.identities.get(userId) ?? null);
    },
    async writeIdentity(userId, hatch) {
      if (store.faults.save) return failed;
      return ok(freeze(store, userId, hatch));
    },
    async markRevealed(userId) {
      if (store.faults.save) return failed;
      const record = store.identities.get(userId);
      if (!record || record.revelacionVista) return ok(false);
      store.identities.set(userId, { ...record, revelacionVista: true });
      return ok(true);
    },
    async listAliases() {
      return ok(
        [...store.identities.values()]
          .map((r) => r.aliasCompleto)
          .filter((a): a is string => a !== null),
      );
    },
    async setPaused(userId, paused) {
      if (store.faults.save) return failed;
      if (paused) store.paused.add(userId);
      else store.paused.delete(userId);
      store.version += 1;
      return ok(undefined);
    },
    async deleteAccount(userId) {
      if (store.faults.save) return failed;
      store.results.delete(userId);
      store.identities.delete(userId);
      store.paused.delete(userId);
      store.chatPins.delete(userId);
      store.chatEvents.splice(0, store.chatEvents.length, ...store.chatEvents.filter((e) => e.userId !== userId));
      store.version += 1;
      return ok(undefined);
    },
    async saveQuizResult(record) {
      if (store.faults.save) return failed;
      const frozen = store.identities.get(record.userId)?.estadoIdentidad === "eclosionado";
      store.results.set(record.userId, record);
      store.version += 1;
      if (record.hatch && !frozen) return ok(freeze(store, record.userId, record.hatch));
      if (!store.identities.has(record.userId)) store.identities.set(record.userId, eggIdentity());
      return ok(outcomeOf(store, record.userId));
    },
    async setInclusiveMode(userId, mode) {
      store.inclusiveModes.set(userId, mode);
    },
    async loadCompletedPool() {
      return store.faults.pool ? failed : ok(store.pool());
    },
    countActive: async () => store.pool().length,
    async findOwn(userId) {
      if (store.own) return ok(store.own);
      const record = store.results.get(userId);
      if (!record) return ok(null);
      const identity = store.identities.get(userId) ?? eggIdentity();
      const color = CATALOG_COLORS.find((c) => c.id === identity.colorId) ?? null;
      const animal = CATALOG_ANIMALS.find((a) => a.id === identity.animalId) ?? null;
      return ok({
        identity,
        narrative: identity.narrative ?? record.narrative ?? "",
        animal: animal === null ? null : { id: animal.id, diminutivo_es: animal.diminutivo, categoria_fauna: "" },
        color: color === null ? null : { id: color.id, nombre: color.nombre, hex: color.hex },
        latent: record.scored.latent,
        normalizedScores: record.scored.normalizedScores,
        completedModules: record.completedModules,
      });
    },
    loadAnswers: async (userId) => ok([...(store.results.get(userId)?.answers ?? [])]),
    findCounterparts: async (ids) => {
      if (store.counterparts.length > 0) {
        return store.counterparts.filter((c) => ids.includes(c.userId));
      }
      return ids.flatMap((id): CounterpartProfile[] => {
        const rec = store.results.get(id);
        const identity = store.identities.get(id);
        if (!rec || !identity) return [];
        return [
          {
            userId: id,
            estadoIdentidad: identity.estadoIdentidad,
            aliasCompleto: identity.aliasCompleto,
            aliasAnimal: identity.aliasAnimal,
            aliasColor: identity.aliasColor,
            aliasSufijo: identity.aliasSufijo,
            mbtiCode: identity.mbtiCode,
            enneagramCode: identity.enneagramCode,
            latent: rec.scored.latent,
            animalId: identity.animalId,
            colorId: identity.colorId,
            mark: identity.mark,
            showAvatarDetail: store.showDetail.has(id),
            sharedLayers: [...(store.sharedLayers.get(id) ?? [])],
          },
        ];
      });
    },
  };
}

export function memoryMatches(store: MemoryStore): MatchRepository {
  return {
    poolVersion: async () => ok(String(store.version)),
    async replaceAll(pairs, poolVersion) {
      if (store.concurrentArrivals > 0) {
        store.concurrentArrivals -= 1;
        store.version += 1;
      }
      if (String(store.version) !== poolVersion) return ok("pool_changed");
      store.matches = normalizeMatchPairs(pairs);
      return ok("replaced");
    },
    listFor: async (userId) => {
      if (store.stored.length > 0) return ok(store.stored);
      const self = userId.toLowerCase();
      const out: StoredMatch[] = [];
      for (const m of store.matches) {
        if (m.userA !== self && m.userB !== self) continue;
        const otherId = m.userA === self ? m.userB : m.userA;
        if (store.identities.get(otherId)?.estadoIdentidad !== "eclosionado") continue;
        out.push({
          track: m.track,
          otherUser: otherId,
          similarity: m.similarity,
          badges: [...m.badges],
        });
      }
      return ok(out);
    },
  };
}

export function memoryNotifications(store: MemoryStore): NotificationRepository {
  return {
    async notifyMatches(userId) {
      if (store.faults.notify) return failed;
      const self = userId.toLowerCase();
      const romancePeers = store.matches
        .filter((m) => m.track === "romance" && (m.userA === self || m.userB === self))
        .map((m) => (m.userA === self ? m.userB : m.userA))
        .sort();
      const amistadPeers = store.matches
        .filter((m) => m.track === "amistad" && (m.userA === self || m.userB === self))
        .map((m) => (m.userA === self ? m.userB : m.userA))
        .sort();

      const romanceSig = romancePeers.join(",");
      const amistadSig = amistadPeers.join(",");

      let inserted = false;
      for (const [track, peers, sig, type] of [
        ["romance", romancePeers, romanceSig, "match_romance"],
        ["amistad", amistadPeers, amistadSig, "match_amistad"],
      ] as const) {
        if (peers.length === 0) continue;
        const latest = [...store.notifications]
          .reverse()
          .find((n) => n.userId === userId && n.type === type);
        if (latest && latest.metadata?.["match_set_hash"] === sig) continue;
        // Remove previous unread notifications of this track or no_match
        for (let i = store.notifications.length - 1; i >= 0; i--) {
          const item = store.notifications[i]!;
          if (item.userId === userId && !item.read && (item.type === type || item.type === "no_match")) {
            store.notifications.splice(i, 1);
          }
        }
        store.notifications.push({
          userId,
          id: `n${store.notifications.length}`,
          type,
          title: track === "romance" ? "El universo conspiró a tu favor" : "Tu vibra resonó con alguien",
          body: `Matches (${peers.length})`,
          metadata: { match_count: peers.length, track, match_set_hash: sig },
          read: false,
          created_at: "2026-10-31T00:00:00.000Z",
        });
        inserted = true;
      }

      if (romancePeers.length === 0 && amistadPeers.length === 0) {
        const latestMatchNotif = [...store.notifications]
          .reverse()
          .find(
            (n) =>
              n.userId === userId &&
              (n.type === "match_romance" || n.type === "match_amistad" || n.type === "no_match"),
          );
        if (!latestMatchNotif || latestMatchNotif.type !== "no_match") {
          store.notifications.push({
            userId,
            id: `n${store.notifications.length}`,
            type: "no_match",
            title: "Tu momento llegará",
            body: "Sin matches por ahora",
            metadata: {},
            read: false,
            created_at: "2026-10-31T00:00:00.000Z",
          });
          inserted = true;
        }
      }

      if (inserted) {
        store.notified.push(userId);
      }
      return ok(undefined);
    },
    async insertWelcome(userId, message, metadata) {
      if (store.notifications.some((n) => n.userId === userId && n.type === "welcome")) return;
      store.notifications.push({
        userId,
        id: `n${store.notifications.length}`,
        type: "welcome",
        title: message.title,
        body: message.body,
        metadata,
        read: false,
        created_at: "2026-10-31T00:00:00.000Z",
      });
    },
    listMine: async (unreadOnly) =>
      ok(store.notifications.filter((n) => n.userId === store.viewer && (!unreadOnly || !n.read))),
    async markRead(ids) {
      let count = 0;
      for (const n of store.notifications) {
        if (n.userId === store.viewer && ids.includes(n.id) && !n.read) {
          n.read = true;
          count += 1;
        }
      }
      return ok(count);
    },
  };
}

export const instantScheduler = { sleep: async () => {}, random: () => 0 };

export function memoryChatPins(store: MemoryStore): ChatPinRepository {
  return {
    find: async (userId) => (store.faults.save ? failed : ok(store.chatPins.get(userId) ?? null)),
    async create(userId, digest, at) {
      if (store.faults.save) return failed;
      if (store.chatPins.has(userId)) return ok(false);
      store.chatPins.set(userId, {
        digest, createdAt: at, changedAt: at, attempts: clearAttempts(),
        recentFailures: 0, lastFailedAt: null, recoveryRequestedAt: null, revision: 0,
      });
      return ok(true);
    },
    async update(userId, revision, patch) {
      if (store.faults.save) return failed;
      const current = store.chatPins.get(userId);
      if (!current || (revision !== null && current.revision !== revision)) return ok(false);
      store.chatPins.set(userId, { ...current, ...patch, revision: current.revision + 1 });
      return ok(true);
    },
    async recordEvent(userId, kind, at) {
      store.chatEvents.push({ userId, kind, at });
      return ok(undefined);
    },
    listEvents: async (userId, limit) =>
      ok(store.chatEvents.filter((e) => e.userId === userId).reverse().slice(0, limit).map(({ kind, at }) => ({ kind, at }))),
  };
}

/** Reversible stand-in for the scrypt hasher: fast, deterministic, test-only. */
export const plainPinHasher: PinHasher = {
  hash: async (userId, pin) => ({
    hash: `${userId}:${pin}`,
    salt: "salt",
    params: { algorithm: "scrypt", log2N: 1, r: 1, p: 1, keyLen: 1 },
  }),
  verify: async (userId, pin, stored) => stored.hash === `${userId}:${pin}`,
};

export function memoryMatriculas(store: MemoryStore): MatriculaVerifier {
  return { matches: async (userId, matricula) => ok(store.matriculas.get(userId) === matricula) };
}
