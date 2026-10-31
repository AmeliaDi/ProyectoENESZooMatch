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
  matches: GlobalMatch[] = [];
  readonly notifications: Array<NotificationRecord & { userId: string }> = [];
  readonly notified: string[] = [];
  /** Extra completed profiles added "concurrently" on the next N pool reads. */
  concurrentArrivals = 0;
  faults: Faults = {};
  viewer = "";
  own: OwnProfile | null = null;
  counterparts: CounterpartProfile[] = [];
  stored: StoredMatch[] = [];

  pool(): PoolProfile[] {
    return [...this.results.values()].map((r) => ({ userId: r.userId, profile: r.scored }));
  }
}

const failed = err<StorageError>("storage.failed");

export function memoryProfiles(store: MemoryStore): ProfileRepository {
  return {
    isQuizCompleted: async (userId) => ok(store.results.has(userId)),
    async saveQuizResult(record) {
      if (store.faults.save) return failed;
      store.results.set(record.userId, record);
      return ok(undefined);
    },
    async setInclusiveMode(userId, mode) {
      store.inclusiveModes.set(userId, mode);
    },
    async loadCompletedPool() {
      return store.faults.pool ? failed : ok(store.pool());
    },
    findOwn: async () => ok(store.own),
    findCounterparts: async (ids) => store.counterparts.filter((c) => ids.includes(c.userId)),
  };
}

export function memoryMatches(store: MemoryStore): MatchRepository {
  return {
    async replaceAll(pairs, expectedProfiles) {
      const actual = store.results.size + (store.concurrentArrivals > 0 ? 1 : 0);
      if (store.concurrentArrivals > 0) store.concurrentArrivals -= 1;
      if (actual !== expectedProfiles) return ok("pool_changed");
      store.matches = [...pairs];
      return ok("replaced");
    },
    listMine: async () => ok(store.stored),
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
