import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashMatricula, privateLoginEmail } from "@/infrastructure/auth/identity.server";
import { mismatchedKeyNames, missingEnvNames } from "@/infrastructure/env/env-report.server";
import { getServerEnv } from "@/infrastructure/env/env.server";
import { logServerEvent, safeErrorFields } from "@/infrastructure/observability/log.server";
import { createAdminClient } from "@/infrastructure/supabase/admin.server";
import { createClient } from "@/infrastructure/supabase/server";

/**
 * Deliberately carries no "new account" flag: exposing it would let anyone
 * probe whether a matrícula has already registered.
 */
export type MatriculaEntryResult =
  | { ok: true; redirect: "/resultado" | "/cuestionario" }
  | { ok: false; reason: "misconfigured" | "unavailable" };

/** Steps of the entry flow, logged by name when one fails. */
type EntryStep =
  | "profile_lookup"
  | "create_user"
  | "insert_profile"
  | "generate_link"
  | "verify_otp";

interface ProfileRow {
  user_id: string;
  quiz_completed_at: string | null;
}

const RACE_RETRIES = 5;
const RACE_DELAY_MS = 25;

/** Project ref (public, not a secret) so logs reveal env vars from mixed projects. */
function supabaseRef(): string | null {
  const url = getServerEnv()?.NEXT_PUBLIC_SUPABASE_URL;
  return url ? new URL(url).hostname.split(".")[0] ?? null : null;
}

/**
 * 401/403 from Supabase means the key does not belong to the URL's project
 * (e.g. env vars injected by two different Supabase integrations), not an outage.
 */
const KEY_REJECTED_STATUSES = new Set([401, 403]);
/** Missing table/function: the base migration was not applied to this project. */
const SCHEMA_MISSING_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);

function fail(step: EntryStep, error: unknown): MatriculaEntryResult {
  const fields = safeErrorFields(error);
  logServerEvent("error", "enter.failed", { step, supabaseRef: supabaseRef(), ...fields });
  const status = typeof fields.errorStatus === "number" ? fields.errorStatus : 0;
  const code = typeof fields.errorCode === "string" ? fields.errorCode : "";
  const misconfigured = KEY_REJECTED_STATUSES.has(status) || SCHEMA_MISSING_CODES.has(code);
  return { ok: false, reason: misconfigured ? "misconfigured" : "unavailable" };
}

function findProfile(admin: SupabaseClient, matriculaHash: string) {
  return admin
    .from("profiles")
    .select("user_id, quiz_completed_at")
    .eq("matricula_hash", matriculaHash)
    .maybeSingle<ProfileRow>();
}

async function findProfileAfterRace(admin: SupabaseClient, matriculaHash: string) {
  for (let attempt = 0; attempt < RACE_RETRIES; attempt += 1) {
    const existing = await findProfile(admin, matriculaHash);
    if (existing.error || existing.data) return existing;
    await new Promise((resolve) => setTimeout(resolve, RACE_DELAY_MS));
  }
  return findProfile(admin, matriculaHash);
}

/** Creates auth user + profile row; tolerates a concurrent first entry. */
async function createProfile(
  admin: SupabaseClient,
  matriculaHash: string,
  email: string,
): Promise<ProfileRow | MatriculaEntryResult> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
  });
  if (createError || !created.user) {
    const existing = await findProfileAfterRace(admin, matriculaHash);
    return existing.data ?? fail("create_user", createError ?? existing.error);
  }

  const { error: insertError } = await admin
    .from("profiles")
    .insert({ user_id: created.user.id, matricula_hash: matriculaHash });
  if (!insertError) return { user_id: created.user.id, quiz_completed_at: null };

  await admin.auth.admin.deleteUser(created.user.id);
  const existing = await findProfileAfterRace(admin, matriculaHash);
  return existing.data ?? fail("insert_profile", insertError);
}

export async function enterWithMatricula(
  normalizedMatricula: string,
): Promise<MatriculaEntryResult> {
  const env = getServerEnv();
  const admin = createAdminClient();
  const sessionClient = await createClient();
  const mismatched = mismatchedKeyNames();
  if (!env || !admin || !sessionClient || mismatched.length > 0) {
    logServerEvent("error", "enter.misconfigured", {
      missing: missingEnvNames().join(","),
      otherProject: mismatched.join(","),
      supabaseRef: supabaseRef(),
    });
    return { ok: false, reason: "misconfigured" };
  }

  try {
    const matriculaHash = hashMatricula(normalizedMatricula, env.MATRICULA_HMAC_SECRET);
    const email = privateLoginEmail(matriculaHash);

    const lookup = await findProfile(admin, matriculaHash);
    // PostgREST reports the HTTP status on the response, not on the error.
    if (lookup.error) return fail("profile_lookup", { ...lookup.error, status: lookup.status });

    const profile = lookup.data ?? (await createProfile(admin, matriculaHash, email));
    if ("ok" in profile) return profile;

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return fail("generate_link", linkError);

    const { error: sessionError } = await sessionClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (sessionError) return fail("verify_otp", sessionError);

    return { ok: true, redirect: profile.quiz_completed_at ? "/resultado" : "/cuestionario" };
  } catch (error) {
    logServerEvent("error", "enter.threw", safeErrorFields(error));
    return { ok: false, reason: "unavailable" };
  }
}
