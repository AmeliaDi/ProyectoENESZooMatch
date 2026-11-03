import { createHmac, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashAccessKey, verifyAccessKey } from "@/infrastructure/auth/access-key.server";
import { createAccessGuard, guardSubject, type AccessGuard } from "@/infrastructure/auth/access-guard.server";
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
  | { ok: true; redirect: "/resultado" | "/cuestionario"; draftOwner: string }
  | { ok: false; reason: "misconfigured" | "unavailable" | "invalid_key" }
  | { ok: false; reason: "locked"; retryAfter: number };

export interface MatriculaEntryInput {
  matricula: string;
  accessKey: string;
  /** Client network address, only used (HMAC-digested) by the entry guard. */
  address: string;
}

/** Steps of the entry flow, logged by name when one fails. */
type EntryStep =
  | "guard"
  | "profile_lookup"
  | "create_user"
  | "insert_profile"
  | "claim_key"
  | "generate_link"
  | "verify_otp";

interface ProfileRow {
  user_id: string;
  quiz_completed_at: string | null;
  access_key_hash: string | null;
}

const PROFILE_COLUMNS = "user_id, quiz_completed_at, access_key_hash";
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
/** Missing table/function/column: the base migration was not applied to this project. */
const SCHEMA_MISSING_CODES = new Set(["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"]);

function fail(step: EntryStep, error: unknown): MatriculaEntryResult {
  const fields = safeErrorFields(error);
  logServerEvent("error", "enter.failed", { step, supabaseRef: supabaseRef(), ...fields });
  const status = typeof fields.errorStatus === "number" ? fields.errorStatus : 0;
  const code = typeof fields.errorCode === "string" ? fields.errorCode : "";
  const misconfigured = KEY_REJECTED_STATUSES.has(status) || SCHEMA_MISSING_CODES.has(code);
  return { ok: false, reason: misconfigured ? "misconfigured" : "unavailable" };
}

const isResult = (value: ProfileRow | MatriculaEntryResult): value is MatriculaEntryResult =>
  "ok" in value;

function findProfile(admin: SupabaseClient, matriculaHash: string) {
  return admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
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

/** Creates auth user + profile row (with its key); tolerates a concurrent first entry. */
async function createProfile(
  admin: SupabaseClient,
  matriculaHash: string,
  keyHash: string,
): Promise<ProfileRow | MatriculaEntryResult> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: privateLoginEmail(matriculaHash),
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
  });
  if (createError || !created.user) {
    const existing = await findProfileAfterRace(admin, matriculaHash);
    return existing.data ?? fail("create_user", createError ?? existing.error);
  }

  const row = { user_id: created.user.id, matricula_hash: matriculaHash, access_key_hash: keyHash };
  const { error: insertError } = await admin.from("profiles").insert(row);
  if (!insertError) return { user_id: row.user_id, quiz_completed_at: null, access_key_hash: keyHash };

  await admin.auth.admin.deleteUser(created.user.id);
  const existing = await findProfileAfterRace(admin, matriculaHash);
  return existing.data ?? fail("insert_profile", insertError);
}

/**
 * Profiles created before keys existed get theirs on the next entry
 * (trust on first use). The conditional update makes two concurrent first
 * entries race safely: only one key is stored, the other is then verified.
 */
async function claimKey(
  admin: SupabaseClient,
  profile: ProfileRow,
  keyHash: string,
): Promise<ProfileRow | MatriculaEntryResult> {
  const { data, error } = await admin
    .from("profiles")
    .update({ access_key_hash: keyHash })
    .eq("user_id", profile.user_id)
    .is("access_key_hash", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle<ProfileRow>();
  if (error) return fail("claim_key", error);
  if (data) return data;
  const reread = await admin.from("profiles").select(PROFILE_COLUMNS).eq("user_id", profile.user_id).maybeSingle<ProfileRow>();
  return reread.data ?? fail("claim_key", reread.error);
}

/** Resolves the account and proves the key; never issues a session by itself. */
async function authenticate(
  admin: SupabaseClient,
  matriculaHash: string,
  accessKey: string,
): Promise<ProfileRow | MatriculaEntryResult> {
  const lookup = await findProfile(admin, matriculaHash);
  // PostgREST reports the HTTP status on the response, not on the error.
  if (lookup.error) return fail("profile_lookup", { ...lookup.error, status: lookup.status });

  let profile: ProfileRow | MatriculaEntryResult = lookup.data
    ?? (await createProfile(admin, matriculaHash, await hashAccessKey(accessKey)));
  if (isResult(profile)) return profile;
  if (!profile.access_key_hash) profile = await claimKey(admin, profile, await hashAccessKey(accessKey));
  if (isResult(profile)) return profile;

  const stored = profile.access_key_hash;
  return stored && (await verifyAccessKey(accessKey, stored)) ? profile : { ok: false, reason: "invalid_key" };
}

/**
 * Opaque per-account tag the browser keeps next to its local drafts, so a
 * different person entering on the same device never sees them. Not the user
 * id and not reversible to it.
 */
function draftOwnerTag(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`draft-owner:${userId}`, "utf8").digest("hex").slice(0, 32);
}

/** Throttle checks before any key is compared. */
async function guardBefore(
  guard: AccessGuard,
  addressSubject: string,
  accountSubject: string,
): Promise<MatriculaEntryResult | null> {
  const [address, account] = await Promise.all([
    guard.hit("address_attempt", addressSubject),
    guard.peek("account_failure", accountSubject),
  ]);
  if (address === null || account === null) return fail("guard", new Error("guard unavailable"));
  const retryAfter = Math.max(address, account);
  return retryAfter > 0 ? { ok: false, reason: "locked", retryAfter } : null;
}

async function recordFailure(guard: AccessGuard, addressSubject: string, accountSubject: string) {
  await Promise.all([
    guard.hit("account_failure", accountSubject),
    guard.hit("address_failure", addressSubject),
  ]);
}

async function issueSession(
  admin: SupabaseClient,
  sessionClient: SupabaseClient,
  matriculaHash: string,
): Promise<MatriculaEntryResult | null> {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: privateLoginEmail(matriculaHash),
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return fail("generate_link", linkError);

  const { error: sessionError } = await sessionClient.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  return sessionError ? fail("verify_otp", sessionError) : null;
}

export async function enterWithMatricula(input: MatriculaEntryInput): Promise<MatriculaEntryResult> {
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

  // Whatever happens next, the previous person on this device is signed out:
  // a failed entry must never leave someone else's session in place.
  await sessionClient.auth.signOut({ scope: "local" }).catch(() => undefined);

  try {
    const secret = env.MATRICULA_HMAC_SECRET;
    const matriculaHash = hashMatricula(input.matricula, secret);
    const guard = createAccessGuard(admin);
    const addressSubject = guardSubject("address", input.address, secret);
    const accountSubject = guardSubject("account", matriculaHash, secret);

    const blocked = await guardBefore(guard, addressSubject, accountSubject);
    if (blocked) return blocked;

    const profile = await authenticate(admin, matriculaHash, input.accessKey);
    if (isResult(profile)) {
      if (!profile.ok && profile.reason === "invalid_key") await recordFailure(guard, addressSubject, accountSubject);
      return profile;
    }
    await guard.clear("account_failure", accountSubject);

    const sessionFailure = await issueSession(admin, sessionClient, matriculaHash);
    if (sessionFailure) return sessionFailure;
    return {
      ok: true,
      redirect: profile.quiz_completed_at ? "/resultado" : "/cuestionario",
      draftOwner: draftOwnerTag(profile.user_id, secret),
    };
  } catch (error) {
    logServerEvent("error", "enter.threw", safeErrorFields(error));
    return { ok: false, reason: "unavailable" };
  }
}
