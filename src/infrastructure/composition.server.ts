/**
 * Composition root: the only place that turns env + Supabase clients into
 * application dependencies. Route handlers call these factories and stay thin.
 */
import { createHash } from "node:crypto";

import type { AdminConsoleRepository, AdminDeps, AdminLoginDeps } from "@/application/admin";
import type { ChatRecoveryDeps, ConversationRepository, InterestDeps, InvitationDeps } from "@/application/chat";
import type { AppError } from "@/application/errors";
import type { GetResultDeps } from "@/application/get-result";
import type { HatchDeps } from "@/application/hatch";
import type { PrivacyDeps } from "@/application/privacy";
import type { RevelationDeps } from "@/application/revelation";
import type { AdminRepository, NotificationRepository, PinHasher, Scheduler } from "@/application/ports";
import type { RecomputeDeps } from "@/application/recompute-matches";
import { recomputeMatches } from "@/application/recompute-matches";
import type { RefineDeps } from "@/application/refine-profile";
import type { SubmitQuizDeps } from "@/application/submit-quiz";
import { RETENTION_CONFIG } from "@/config";
import { err, ok, type Clock, type Result } from "@/domain/shared";

import { supabaseAdminConsoleRepository } from "./admin/console-repository";
import { createAccessGuard, guardSubject } from "./auth/access-guard.server";
import { supabaseConversationRepository } from "./chat/conversation-repository";
import { createPinHasher } from "./chat/pin-hasher.server";
import { supabaseChatPinRepository, supabaseMatriculaVerifier } from "./chat/pin-repository";
import { getChatPinPepper, getServerEnv } from "./env/env.server";

import { serverLatentScorer } from "./latent-scorer.server";
import { createAdminClient } from "./supabase/admin.server";
import {
  RPC,
  supabaseAdminRepository,
  supabaseMatchRepository,
  supabaseNotificationRepository,
  supabaseProfileRepository,
} from "./supabase/repositories";
import { createClient } from "./supabase/server";

type Failure = Extract<AppError, "service.unavailable" | "auth.unauthorized" | "auth.forbidden">;

const systemScheduler: Scheduler = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

const systemClock: Clock = { now: () => new Date() };

const sha256Hex = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");

/** Authenticated session client plus the viewer's id. */
async function authenticated() {
  const session = await createClient();
  if (!session) return err<Failure>("service.unavailable");
  const { data, error } = await session.auth.getUser();
  if (error || !data.user) return err<Failure>("auth.unauthorized");
  return ok({ session, userId: data.user.id });
}

export async function quizContext(): Promise<
  Result<{ userId: string; deps: SubmitQuizDeps }, Failure>
> {
  return refineContext();
}

/** A refinement re-scores and republishes exactly like the full test. */
export async function refineContext(): Promise<Result<{ userId: string; deps: RefineDeps }, Failure>> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  const profiles = supabaseProfileRepository(admin);
  const env = getServerEnv();
  if (!env) return err("service.unavailable");
  return ok({
    userId: auth.value.userId,
    deps: {
      profiles,
      matches: supabaseMatchRepository(admin),
      notifications: supabaseNotificationRepository(admin, auth.value.session),
      scheduler: systemScheduler,
      latentScorer: serverLatentScorer,
      secret: env.MATRICULA_HMAC_SECRET,
    },
  });
}

/**
 * Result and "Tu carta" both read the frozen identity, so both first make sure
 * a person whose core is complete is no longer an egg (a submission that lost
 * the deploy window self-heals here, once, and never again).
 */
export async function resultContext(): Promise<
  Result<{ userId: string; deps: GetResultDeps; hatch: HatchDeps }, Failure>
> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  const env = getServerEnv();
  if (!env) return err("service.unavailable");
  const profiles = supabaseProfileRepository(admin);
  return ok({
    userId: auth.value.userId,
    deps: {
      profiles,
      matches: supabaseMatchRepository(admin),
      digest: sha256Hex,
    },
    hatch: { profiles, secret: env.MATRICULA_HMAC_SECRET },
  });
}

/**
 * Fase 4: the revelation is shown exactly once. The write is idempotent and
 * concurrency-safe (the RPC flips one boolean inside a transaction), so a
 * double tap or a reopened tab can never repeat the animation.
 */
export async function revelationContext(): Promise<
  Result<{ userId: string; deps: RevelationDeps }, Failure>
> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  return ok({ userId: auth.value.userId, deps: { profiles: supabaseProfileRepository(admin) } });
}

export async function privacyContext(): Promise<
  Result<{ userId: string; deps: PrivacyDeps; signOut: () => Promise<void> }, Failure>
> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  const { session } = auth.value;
  return ok({
    userId: auth.value.userId,
    deps: {
      profiles: supabaseProfileRepository(admin),
      matches: supabaseMatchRepository(admin),
      scheduler: systemScheduler,
    },
    signOut: async () => {
      await session.auth.signOut().catch(() => undefined);
    },
  });
}

export async function notificationContext(): Promise<Result<NotificationRepository, Failure>> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  return ok(supabaseNotificationRepository(null, auth.value.session));
}

/**
 * Admin console dependencies (ADR-036). Authentication is the console's own
 * signed session (`requireAdmin`), not a Supabase one, so everything here
 * runs with the service role and must only be reached behind that gate.
 * The admin PIN reuses the chat pepper under a separate hashing subject.
 */
export interface AdminConsoleContext {
  console: AdminConsoleRepository;
  deps: AdminDeps;
  login: AdminLoginDeps;
  /** Dashboard aggregates through the same service-role client. */
  metrics: AdminRepository;
  clock: Clock;
  pepper: string;
  /** Per-address login guard: seconds locked, or `null` when it failed (fail closed). */
  guardAddress(address: string): Promise<number | null>;
}

/** Separate subject: an admin PIN digest never equals a chat PIN digest. */
function adminHasher(pepper: string): PinHasher {
  const inner = createPinHasher(pepper);
  const subject = (userId: string) => `admin:${userId}`;
  return {
    hash: (userId, pin) => inner.hash(subject(userId), pin),
    verify: (userId, pin, stored) => inner.verify(subject(userId), pin, stored),
  };
}

export async function adminConsoleContext(): Promise<Result<AdminConsoleContext, Failure>> {
  const pepper = getChatPinPepper();
  const env = getServerEnv();
  const admin = createAdminClient();
  if (!pepper || !env || !admin) return err("service.unavailable");
  const consoleRepo = supabaseAdminConsoleRepository(admin, env.MATRICULA_HMAC_SECRET);
  const guard = createAccessGuard(admin);
  return ok({
    console: consoleRepo,
    deps: { console: consoleRepo, profiles: supabaseProfileRepository(admin), matches: supabaseMatchRepository(admin), scheduler: systemScheduler },
    login: { console: consoleRepo, hasher: adminHasher(pepper), clock: systemClock },
    metrics: supabaseAdminRepository(admin),
    clock: systemClock,
    pepper,
    guardAddress: (address) =>
      guard.hit("admin_address", guardSubject("admin_address", address, env.MATRICULA_HMAC_SECRET)),
  });
}

export interface ChatContext {
  userId: string;
  deps: ChatRecoveryDeps;
  /** Conversations between matches; only reachable behind `requireChatLock`. */
  conversations: ConversationRepository;
  /** Current matches (invitations are only shown for a current match). */
  matches: InvitationDeps["matches"];
  digest(input: string): string;
  /** Signs the lock-session cookie (key derived from it). */
  pepper: string;
  /** Per-address PIN guard: seconds locked, or `null` when it failed (fail closed). */
  guardAddress(address: string): Promise<number | null>;
}

/**
 * Chat PIN dependencies. Without `CHAT_PIN_PEPPER` (or the server env) the
 * chat routes answer `service.unavailable`; nothing else is affected.
 */
export async function chatContext(): Promise<Result<ChatContext, Failure>> {
  const pepper = getChatPinPepper();
  const env = getServerEnv();
  if (!pepper || !env) return err("service.unavailable");
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  const guard = createAccessGuard(admin);
  return ok({
    userId: auth.value.userId,
    pepper,
    conversations: supabaseConversationRepository(admin),
    matches: supabaseMatchRepository(admin),
    digest: sha256Hex,
    deps: {
      pins: supabaseChatPinRepository(admin),
      hasher: createPinHasher(pepper),
      matricula: supabaseMatriculaVerifier(admin, env.MATRICULA_HMAC_SECRET),
      clock: systemClock,
    },
    guardAddress: (address) =>
      guard.hit("chat_pin_address", guardSubject("chat_pin_address", address, env.MATRICULA_HMAC_SECRET)),
  });
}

/**
 * "Me interesa conocerte" lives in the result view, outside the chat lock: it
 * reveals nothing (one-sided signals are invisible to the other person).
 */
export async function interestContext(): Promise<Result<{ userId: string; deps: InterestDeps }, Failure>> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  return ok({
    userId: auth.value.userId,
    deps: {
      matches: supabaseMatchRepository(admin),
      conversations: supabaseConversationRepository(admin),
      digest: sha256Hex,
      clock: systemClock,
    },
  });
}

export function recomputeDeps(): Result<RecomputeDeps, Failure> {
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  return ok({
    profiles: supabaseProfileRepository(admin),
    matches: supabaseMatchRepository(admin),
    scheduler: systemScheduler,
  });
}

export interface RetentionSummary {
  softDeletedAbandoned: number;
  purgedSoftDeleted: number;
  purgedReadNotifications: number;
  purgedSecurityEvents: number;
  purgedAccessGuard: number;
  purgedChatRows: number;
  matchesRecomputed: boolean;
}

export async function runScheduledRetention(): Promise<Result<RetentionSummary, Failure | "storage.failed">> {
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");

  const retentionRes = await admin.rpc(RPC.applyRetention, {
    p_abandoned_days: RETENTION_CONFIG.abandoned_incomplete_days.valor,
    p_grace_days: RETENTION_CONFIG.soft_delete_grace_days.valor,
    p_read_notification_days: RETENTION_CONFIG.read_notifications_days.valor,
    p_security_event_days: RETENTION_CONFIG.chat_security_events_days.valor,
    p_access_guard_hours: RETENTION_CONFIG.access_guard_hours.valor,
  });
  if (retentionRes.error) return err("storage.failed");

  const chatRes = await admin.rpc(RPC.purgeChat, {
    p_message_days: RETENTION_CONFIG.chat_message_days.valor,
    p_inactive_days: RETENTION_CONFIG.chat_inactive_days.valor,
    p_signal_days: RETENTION_CONFIG.chat_signal_days.valor,
    p_cooldown_days: RETENTION_CONFIG.chat_cooldown_days.valor,
  });
  if (chatRes.error) return err("storage.failed");

  const recomputed = await recomputeMatches({
    profiles: supabaseProfileRepository(admin),
    matches: supabaseMatchRepository(admin),
    scheduler: systemScheduler,
  });

  const data = (retentionRes.data ?? {}) as Record<string, unknown>;
  return ok({
    softDeletedAbandoned: Number(data.softDeletedAbandoned ?? 0),
    purgedSoftDeleted: Number(data.purgedSoftDeleted ?? 0),
    purgedReadNotifications: Number(data.purgedReadNotifications ?? 0),
    purgedSecurityEvents: Number(data.purgedSecurityEvents ?? 0),
    purgedAccessGuard: Number(data.purgedAccessGuard ?? 0),
    purgedChatRows: typeof chatRes.data === "number" ? chatRes.data : 0,
    matchesRecomputed: recomputed.ok,
  });
}
