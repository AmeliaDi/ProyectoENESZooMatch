/**
 * Console login: matrícula + admin PIN (ADR-036). Every failure answers the
 * same `admin.invalid`, whether the matrícula is unknown, not an admin or the
 * PIN is wrong; only a running pause is reported (with its wait). A guess is
 * charged before the hash is compared, as in the chat lock.
 */
import { ADMIN_CONFIG } from "@/config";
import { chargeAttempt, clearAttempts, pauseSecondsLeft, type AttemptPolicy, type AttemptState } from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";

import type { AppFailure } from "../errors";
import { auditAlias, type AdminAccount, type AdminAttempts, type AdminCredential, type AdminLoginDeps } from "./ports";

const POLICY: AttemptPolicy = {
  perStep: ADMIN_CONFIG.attempts.perStep,
  waitMinutes: ADMIN_CONFIG.attempts.waitMinutes,
  resetOnlyAfterMaxPauses: Number.POSITIVE_INFINITY,
};
const CHARGE_RETRIES = 3;
/** Stand-in id so an unknown account still pays one KDF run (uniform timing). */
const DECOY_ID = "admin-decoy";

const invalid: AppFailure = { code: "admin.invalid" };
const toState = (a: AdminAttempts): AttemptState => ({ ...a, longPauses: 0 });
const fromState = ({ failedAttempts, pauseStep, lockedUntil }: AttemptState): AdminAttempts => ({ failedAttempts, pauseStep, lockedUntil });

type Charged = { credential: AdminCredential; paused: number };

async function charge(userId: string, deps: AdminLoginDeps): Promise<Result<Charged | null, AppFailure>> {
  for (let tries = 0; tries < CHARGE_RETRIES; tries += 1) {
    const found = await deps.console.findCredential(userId);
    if (!found.ok) return err({ code: found.error });
    if (!found.value) return ok(null);
    const now = deps.clock.now();
    const waiting = pauseSecondsLeft(toState(found.value.attempts), now);
    if (waiting > 0) return err({ code: "admin.paused", retryAfter: waiting });
    const next = chargeAttempt(toState(found.value.attempts), now, POLICY);
    const saved = await deps.console.updateAttempts(userId, found.value.revision, fromState(next.state));
    if (!saved.ok) return err({ code: saved.error });
    if (saved.value) return ok({ credential: found.value, paused: pauseSecondsLeft(next.state, now) });
  }
  return err({ code: "service.unavailable" });
}

async function resolveAdmin(matricula: string, deps: AdminLoginDeps): Promise<Result<AdminAccount | null, AppFailure>> {
  const account = await deps.console.findAccount(matricula);
  if (!account.ok) return err({ code: account.error });
  if (!account.value) return ok(null);
  const admin = await deps.console.isAdmin(account.value.userId);
  if (!admin.ok) return err({ code: admin.error });
  return ok(admin.value ? account.value : null);
}

export async function adminLogin(matricula: string, pin: string, deps: AdminLoginDeps): Promise<Result<AdminAccount, AppFailure>> {
  const account = await resolveAdmin(matricula, deps);
  if (!account.ok) return account;
  const charged = account.value ? await charge(account.value.userId, deps) : ok(null);
  if (!charged.ok) return charged;
  if (!account.value || !charged.value) {
    await deps.hasher.hash(DECOY_ID, pin);
    return err(invalid);
  }
  const { userId, identity } = account.value;
  const matches = await deps.hasher.verify(userId, pin, charged.value.credential.digest);
  if (!matches) {
    await deps.console.recordAudit({ adminId: userId, adminAlias: auditAlias(identity), action: "login_failed" });
    const paused = charged.value.paused;
    return err(paused > 0 ? { code: "admin.paused", retryAfter: paused } : invalid);
  }
  await deps.console.updateAttempts(userId, null, fromState(clearAttempts()));
  await deps.console.recordAudit({ adminId: userId, adminAlias: auditAlias(identity), action: "login" });
  return ok(account.value);
}
