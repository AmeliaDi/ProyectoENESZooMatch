/**
 * Composition root: the only place that turns env + Supabase clients into
 * application dependencies. Route handlers call these factories and stay thin.
 */
import { createHash } from "node:crypto";

import type { AppError } from "@/application/errors";
import type { GetResultDeps } from "@/application/get-result";
import type { PrivacyDeps } from "@/application/privacy";
import type { AdminRepository, NotificationRepository, Scheduler } from "@/application/ports";
import type { RecomputeDeps } from "@/application/recompute-matches";
import type { RefineDeps } from "@/application/refine-profile";
import type { SubmitQuizDeps } from "@/application/submit-quiz";
import { err, ok, type Result } from "@/domain/shared";

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

export function recomputeDeps(): Result<RecomputeDeps, Failure> {
  const admin = createAdminClient();
  if (!admin) return err("service.unavailable");
  return ok({
    profiles: supabaseProfileRepository(admin),
    matches: supabaseMatchRepository(admin),
    scheduler: systemScheduler,
  });
}
