/**
 * Ports the use cases depend on. Infrastructure adapters implement them;
 * tests use in-memory fakes. Adapters must not throw: every expected failure
 * comes back as a `Result`.
 */
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";
import type { GlobalMatch } from "@/domain/matching";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";
import type { Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack, ProfileIdentity, ScoredProfile } from "@/types/microtest";

import type { AppError, StorageError } from "./errors";

export type { Clock, Hmac } from "@/domain/shared";

export interface SessionPort {
  currentUserId(): Promise<Result<string, Extract<AppError, "auth.unauthorized">>>;
}

export interface StoredAnswer {
  itemId: string;
  value?: number;
  selected?: string[];
}

export interface QuizResultRecord {
  userId: string;
  answers: readonly StoredAnswer[];
  scored: ScoredProfile;
  identity: ProfileIdentity;
}

export interface PoolProfile {
  userId: string;
  profile: ScoredProfile;
}

export interface OwnProfile {
  alias: string;
  narrative: string;
  mbtiCode: string | null;
  dimensionScores: Record<string, number> | null;
  romanceVector: number[] | null;
  amistadVector: number[] | null;
  animal: { id: string; diminutivo_es: string; categoria_fauna: string } | null;
  color: { id: string; nombre: string; hex: string } | null;
  mark: SubtypeMark | null;
  /** Posterior θ̂/SE; owner-only input of "Tu carta", never serialized. */
  latent: LatentProfile | null;
}

export interface CounterpartProfile {
  userId: string;
  dimensionScores: Record<string, number> | null;
  mbtiCode: string | null;
  romanceVector: number[] | null;
  amistadVector: number[] | null;
  animalId: string | null;
  colorId: string | null;
  mark: SubtypeMark | null;
  /** Opt-in disclosure of the wing tone and subtype mark to third parties. */
  showAvatarDetail: boolean;
}

export interface PrivacyState {
  paused: boolean;
  showAvatarDetail: boolean;
}

export interface ProfileRepository {
  isQuizCompleted(userId: string): Promise<Result<boolean, StorageError>>;
  privacyState(userId: string): Promise<Result<PrivacyState, StorageError>>;
  setPaused(userId: string, paused: boolean): Promise<Result<void, StorageError>>;
  setShowAvatarDetail(userId: string, show: boolean): Promise<Result<void, StorageError>>;
  /** Deletes the auth user; every participant row cascades from it. */
  deleteAccount(userId: string): Promise<Result<void, StorageError>>;
  saveQuizResult(record: QuizResultRecord): Promise<Result<void, StorageError>>;
  /** Cosmetic preference; best-effort. */
  setInclusiveMode(userId: string, mode: InclusiveMode): Promise<void>;
  /** Completed and not paused: the only profiles that take part in matching. */
  loadCompletedPool(): Promise<Result<PoolProfile[], StorageError>>;
  /** Best-effort size of the active pool; `null` when unknown. Never exposed raw. */
  countActive(): Promise<number | null>;
  findOwn(userId: string): Promise<Result<OwnProfile | null, StorageError>>;
  /** Best-effort: missing counterparts simply produce no explanation. */
  findCounterparts(userIds: readonly string[]): Promise<CounterpartProfile[]>;
}

export interface StoredMatch {
  track: MatchTrack;
  otherUser: string | null;
  otherAlias: string | null;
  otherAnimal: string | null;
  otherColor: string | null;
  similarity: number;
  badges: Array<{ dimension: string; affinity: number }>;
}

export type ReplaceOutcome = "replaced" | "pool_changed";

export interface MatchRepository {
  /** Opaque token for the current completed pool; read it BEFORE the pool. */
  poolVersion(): Promise<Result<string, StorageError>>;
  /** Writes nothing and reports `pool_changed` when `poolVersion` is stale. */
  replaceAll(
    pairs: readonly GlobalMatch[],
    poolVersion: string,
  ): Promise<Result<ReplaceOutcome, StorageError>>;
  listFor(userId: string): Promise<Result<StoredMatch[], StorageError>>;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null | undefined;
  read: boolean;
  created_at: string;
}

export interface NotificationRepository {
  notifyMatches(userId: string): Promise<Result<void, StorageError>>;
  insertWelcome(
    userId: string,
    message: { title: string; body: string },
    metadata: Record<string, string>,
  ): Promise<void>;
  listMine(unreadOnly: boolean): Promise<Result<NotificationRecord[], StorageError>>;
  markRead(ids: readonly string[]): Promise<Result<number, StorageError>>;
}

export interface AdminRepository {
  isAdmin(userId: string): Promise<boolean>;
  loadDashboard(thresholds: {
    romance: number;
    amistad: number;
  }): Promise<Result<unknown, StorageError>>;
}

/** Deferred effects for retry loops, injectable for tests. */
export interface Scheduler {
  sleep(ms: number): Promise<void>;
  random(): number;
}
