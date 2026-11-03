/**
 * Ports the use cases depend on. Infrastructure adapters implement them;
 * tests use in-memory fakes. Adapters must not throw: every expected failure
 * comes back as a `Result`.
 */
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";
import type { AttemptState } from "@/domain/chat";
import type { GlobalMatch } from "@/domain/matching";
import type { InclusiveMode } from "@/domain/messages/inclusive-text";
import type { Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack, ProfileIdentity, QuizModuleId, ScoredProfile } from "@/types/microtest";
import type { ShareLayerId } from "@/types/sharing";

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
  /** Optional modules whose non-sensitive items are all answered. */
  completedModules: readonly QuizModuleId[];
}

export interface PoolProfile {
  userId: string;
  profile: ScoredProfile;
}

export interface OwnProfile {
  alias: string;
  narrative: string;
  mbtiCode: string | null;
  animal: { id: string; diminutivo_es: string; categoria_fauna: string } | null;
  color: { id: string; nombre: string; hex: string } | null;
  mark: SubtypeMark | null;
  /** Posterior θ̂/SE: input of "Tu carta" and of the explanation, never serialized. */
  latent: LatentProfile | null;
  completedModules: readonly QuizModuleId[];
}

export interface CounterpartProfile {
  userId: string;
  mbtiCode: string | null;
  /** Server-only: lets the explanation recompute the exact pair score. */
  latent: LatentProfile | null;
  animalId: string | null;
  colorId: string | null;
  mark: SubtypeMark | null;
  /** Opt-in disclosure of the wing tone and subtype mark to third parties. */
  showAvatarDetail: boolean;
  /** Reading layers this person chose to show (ADR-030); empty by default. */
  sharedLayers: readonly ShareLayerId[];
}

export interface PrivacyState {
  paused: boolean;
  showAvatarDetail: boolean;
  sharedLayers: ShareLayerId[];
}

export interface ProfileRepository {
  isQuizCompleted(userId: string): Promise<Result<boolean, StorageError>>;
  privacyState(userId: string): Promise<Result<PrivacyState, StorageError>>;
  setPaused(userId: string, paused: boolean): Promise<Result<void, StorageError>>;
  setShowAvatarDetail(userId: string, show: boolean): Promise<Result<void, StorageError>>;
  setSharedLayers(userId: string, layers: readonly ShareLayerId[]): Promise<Result<void, StorageError>>;
  /** Deletes the auth user; every participant row cascades from it. */
  deleteAccount(userId: string): Promise<Result<void, StorageError>>;
  /** Resolves to the effective alias: the first one ever assigned is kept. */
  saveQuizResult(record: QuizResultRecord): Promise<Result<{ alias: string }, StorageError>>;
  /** Cosmetic preference; best-effort. */
  setInclusiveMode(userId: string, mode: InclusiveMode): Promise<void>;
  /** Completed and not paused: the only profiles that take part in matching. */
  loadCompletedPool(): Promise<Result<PoolProfile[], StorageError>>;
  /** Best-effort size of the active pool; `null` when unknown. Never exposed raw. */
  countActive(): Promise<number | null>;
  findOwn(userId: string): Promise<Result<OwnProfile | null, StorageError>>;
  /** Own stored answers (server-only: used to merge a refinement module). */
  loadAnswers(userId: string): Promise<Result<StoredAnswer[], StorageError>>;
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

/** scrypt parameters stored next to each PIN hash so they can evolve. */
export interface PinKdfParams {
  algorithm: "scrypt";
  log2N: number;
  r: number;
  p: number;
  keyLen: number;
}

/** Output of the PIN KDF; never leaves the server. */
export interface PinDigest {
  hash: string;
  salt: string;
  params: PinKdfParams;
}

export interface PinHasher {
  hash(userId: string, pin: string): Promise<PinDigest>;
  /** Constant-time comparison against the stored digest. */
  verify(userId: string, pin: string, stored: PinDigest): Promise<boolean>;
}

export interface ChatPinRecord {
  digest: PinDigest;
  createdAt: Date;
  changedAt: Date;
  attempts: AttemptState;
  /** Failures inside the recent window (aggregate, not one row per guess). */
  recentFailures: number;
  lastFailedAt: Date | null;
  recoveryRequestedAt: Date | null;
  /** Bumped on every write; the compare-and-swap token. */
  revision: number;
}

export type ChatPinPatch = Partial<Omit<ChatPinRecord, "createdAt" | "revision">>;

export const CHAT_SECURITY_EVENT_KINDS = [
  "created",
  "changed",
  "paused",
  "recovery_requested",
  "recovery_cancelled",
  "recovery_completed",
] as const;

export type ChatSecurityEventKind = (typeof CHAT_SECURITY_EVENT_KINDS)[number];

export interface ChatSecurityEvent {
  kind: ChatSecurityEventKind;
  at: Date;
}

export interface ChatPinRepository {
  find(userId: string): Promise<Result<ChatPinRecord | null, StorageError>>;
  /** `false` when the person already has a PIN. */
  create(userId: string, digest: PinDigest, at: Date): Promise<Result<boolean, StorageError>>;
  /**
   * Applies the patch only if the stored revision still equals `revision`
   * (`null` = unconditional). Resolves `false` on a lost race.
   */
  update(userId: string, revision: number | null, patch: ChatPinPatch): Promise<Result<boolean, StorageError>>;
  recordEvent(userId: string, kind: ChatSecurityEventKind, at: Date): Promise<Result<void, StorageError>>;
  listEvents(userId: string, limit: number): Promise<Result<ChatSecurityEvent[], StorageError>>;
}

/** Checks a retyped matrícula against the account in session. */
export interface MatriculaVerifier {
  matches(userId: string, matricula: string): Promise<Result<boolean, StorageError>>;
}

/** Deferred effects for retry loops, injectable for tests. */
export interface Scheduler {
  sleep(ms: number): Promise<void>;
  random(): number;
}
