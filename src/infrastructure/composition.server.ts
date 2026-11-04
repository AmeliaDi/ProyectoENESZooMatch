/**
 * Composition root: the only place that turns env + Supabase clients into
 * application dependencies. Route handlers call these factories and stay thin.
 */
import { createHash } from "node:crypto";

import type { ChatRecoveryDeps, ConversationRepository, InterestDeps, InvitationDeps } from "@/application/chat";
import type { AppError } from "@/application/errors";
import type { GetResultDeps } from "@/application/get-result";
import type { PrivacyDeps } from "@/application/privacy";
import type { AdminRepository, NotificationRepository, Scheduler } from "@/application/ports";
import type { RecomputeDeps } from "@/application/recompute-matches";
import type { RefineDeps } from "@/application/refine-profile";
import type { SubmitQuizDeps } from "@/application/submit-quiz";
import { err, ok, type Clock, type Result } from "@/domain/shared";

import { createAccessGuard, guardSubject } from "./auth/access-guard.server";
import { supabaseConversationRepository } from "./chat/conversation-repository";
import { createPinHasher } from "./chat/pin-hasher.server";
import { supabaseChatPinRepository, supabaseMatriculaVerifier } from "./chat/pin-repository";
import { getChatPinPepper, getServerEnv } from "./env/env.server";

import { serverLatentScorer } from "./latent-scorer.server";
import { createAdminClient } from "./supabase/admin.server";
import {
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
  return ok({
    userId: auth.value.userId,
    deps: {
      profiles: supabaseProfileRepository(admin),
      matches: supabaseMatchRepository(admin),
      notifications: supabaseNotificationRepository(admin, auth.value.session),
      scheduler: systemScheduler,
      latentScorer: serverLatentScorer,
    },
  });
}


export async function resultContext(): Promise<
  Result<{ userId: string; deps: GetResultDeps }, Failure>
> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  return ok({
    userId: auth.value.userId,
    deps: {
      profiles: supabaseProfileRepository(admin),
      matches: supabaseMatchRepository(admin),
      digest: sha256Hex,
    },
  });
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

/** Resolves the session and checks the admin role. */
export async function adminContext(): Promise<Result<AdminRepository, Failure>> {
  const auth = await authenticated();
  if (!auth.ok) return auth;
  const repo = supabaseAdminRepository(auth.value.session);
  return (await repo.isAdmin(auth.value.userId)) ? ok(repo) : err("auth.forbidden");
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
