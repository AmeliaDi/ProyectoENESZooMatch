/**
 * In-memory adapters for use-case tests. They model the observable contract
 * of the Supabase repositories (pool-size guard, notify-clears-unread) without
 * any network.
 */
import type { GlobalMatch } from "@/domain/matching";
import { clearAttempts } from "@/domain/chat";
import { err, ok } from "@/domain/shared";
import type { ShareLayerId } from "@/types/sharing";

import type { StorageError } from "../errors";
import type {
  ChatPinRecord,
  ChatPinRepository,
  ChatSecurityEvent,
  CounterpartProfile,
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

  pool(): PoolProfile[] {
    return [...this.results.values()]
      .filter((r) => !this.paused.has(r.userId))
      .map((r) => ({ userId: r.userId, profile: r.scored }));
  }
}

const failed = err<StorageError>("storage.failed");

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
      store.paused.delete(userId);
      store.chatPins.delete(userId);
      store.chatEvents.splice(0, store.chatEvents.length, ...store.chatEvents.filter((e) => e.userId !== userId));
      store.version += 1;
      return ok(undefined);
    },
    async saveQuizResult(record) {
      if (store.faults.save) return failed;
      const alias = store.results.get(record.userId)?.identity.alias ?? record.identity.alias;
      store.results.set(record.userId, { ...record, identity: { ...record.identity, alias } });
      store.version += 1;
      return ok({ alias });
    },
    async setInclusiveMode(userId, mode) {
      store.inclusiveModes.set(userId, mode);
    },
    async loadCompletedPool() {
      return store.faults.pool ? failed : ok(store.pool());
    },
    countActive: async () => store.pool().length,
    findOwn: async () => ok(store.own),
    loadAnswers: async (userId) => ok([...(store.results.get(userId)?.answers ?? [])]),
    findCounterparts: async (ids) => store.counterparts.filter((c) => ids.includes(c.userId)),
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
      store.matches = [...pairs];
      return ok("replaced");
    },
    listFor: async () => ok(store.stored),
  };
}

export function memoryNotifications(store: MemoryStore): NotificationRepository {
  return {
    async notifyMatches(userId) {
      if (store.faults.notify) return failed;
      store.notified.push(userId);
      return ok(undefined);
    },
    async insertWelcome(userId, message, metadata) {
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
