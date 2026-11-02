/**
 * In-memory adapters for use-case tests. They model the observable contract
 * of the Supabase repositories (pool-size guard, notify-clears-unread) without
 * any network.
 */
import type { GlobalMatch } from "@/domain/matching";
import { err, ok } from "@/domain/shared";

import type { StorageError } from "../errors";
import type {
  CounterpartProfile,
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
    privacyState: async (userId) => ok({ paused: store.paused.has(userId), showAvatarDetail: store.showDetail.has(userId) }),
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
      store.version += 1;
      return ok(undefined);
    },
    async saveQuizResult(record) {
      if (store.faults.save) return failed;
      store.results.set(record.userId, record);
      store.version += 1;
      return ok(undefined);
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
