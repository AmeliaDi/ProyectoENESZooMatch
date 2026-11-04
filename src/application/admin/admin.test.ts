import { describe, expect, it } from "vitest";

import { ADMIN_CONFIG } from "@/config";
import { MS_PER_MINUTE } from "@/domain/chat";

import { MemoryStore, instantScheduler, memoryMatches, memoryProfiles, plainPinHasher } from "../testing/in-memory";
import { MemoryAdmin, adminUser, memoryAdminConsole } from "../testing/memory-admin";
import { adminLogin } from "./login";
import { listAudit, listUsers, recomputeAudited, reviewReport, runUserAction } from "./users";

const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const MATRICULA = "900000001";
const PIN = "4826";
const START = new Date("2026-11-03T12:00:00.000Z");

async function setup() {
  const store = new MemoryAdmin();
  store.users.set(ADMIN, adminUser(ADMIN, { isAdmin: true, alias: "Observadora" }));
  store.users.set(OTHER, adminUser(OTHER, { hasChatPin: true }));
  store.matriculas.set(MATRICULA, ADMIN);
  store.matriculas.set("900000002", OTHER);
  const digest = await plainPinHasher.hash(ADMIN, PIN);
  store.credentials.set(ADMIN, { digest, attempts: { failedAttempts: 0, pauseStep: 0, lockedUntil: null }, revision: 0 });
  let now = START;
  const clock = { now: () => now };
  const console = memoryAdminConsole(store);
  const pool = new MemoryStore();
  const deps = { console, profiles: memoryProfiles(pool), matches: memoryMatches(pool), scheduler: instantScheduler };
  return { store, console, deps, login: { console, hasher: plainPinHasher, clock }, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

const actor = { userId: ADMIN, alias: "Observadora" };

describe("admin login (ADR-036)", () => {
  it("opens with the right matrícula and PIN and audits the login", async () => {
    const { login, store } = await setup();
    expect(await adminLogin(MATRICULA, PIN, login)).toEqual({ ok: true, value: { userId: ADMIN, alias: "Observadora" } });
    expect(store.audit.map((e) => e.action)).toEqual(["login"]);
  });

  it("answers the same admin.invalid for an unknown matrícula, a non-admin and a wrong PIN", async () => {
    const { login } = await setup();
    const invalid = { ok: false, error: { code: "admin.invalid" } };
    expect(await adminLogin("123456789", PIN, login)).toEqual(invalid);
    expect(await adminLogin("900000002", PIN, login)).toEqual(invalid);
    expect(await adminLogin(MATRICULA, "0000", login)).toEqual(invalid);
  });

  it("pauses after perStep wrong guesses, refuses during the pause, then accepts and clears", async () => {
    const { login, store, advance } = await setup();
    const { perStep, waitMinutes } = ADMIN_CONFIG.attempts;
    for (let i = 0; i < perStep - 1; i += 1) await adminLogin(MATRICULA, "0000", login);
    const last = await adminLogin(MATRICULA, "0000", login);
    expect(last).toMatchObject({ ok: false, error: { code: "admin.paused" } });
    expect(await adminLogin(MATRICULA, PIN, login)).toMatchObject({ ok: false, error: { code: "admin.paused" } });
    advance((waitMinutes[0] ?? 1) * MS_PER_MINUTE);
    expect((await adminLogin(MATRICULA, PIN, login)).ok).toBe(true);
    expect(store.credentials.get(ADMIN)?.attempts).toEqual({ failedAttempts: 0, pauseStep: 0, lockedUntil: null });
    expect(store.audit.filter((e) => e.action === "login_failed")).toHaveLength(perStep);
  });

  it("never puts the PIN or the matrícula in the audit trail", async () => {
    const { login, store } = await setup();
    await adminLogin(MATRICULA, "0000", login);
    await adminLogin(MATRICULA, PIN, login);
    const trail = JSON.stringify(store.audit);
    expect(trail).not.toContain(PIN);
    expect(trail).not.toContain(MATRICULA);
  });
});

describe("admin user control (ADR-036)", () => {
  it("lists users by alias with the configured page size", async () => {
    const { deps } = await setup();
    const page = await listUsers("observa", 0, deps);
    expect(page).toMatchObject({ ok: true, value: { total: 1 } });
    expect(page.ok && page.value.users[0]?.id).toBe(ADMIN);
  });

  it("resets a quiz keeping the alias, audits it and republishes matches", async () => {
    const { deps, store } = await setup();
    const alias = store.users.get(OTHER)?.alias;
    expect(await runUserAction(actor, OTHER, "reset_quiz", deps)).toEqual({ ok: true, value: { recomputePending: false } });
    expect(store.users.get(OTHER)).toMatchObject({ alias, quizCompletedAt: null, animal: null });
    expect(store.audit.at(-1)).toMatchObject({ action: "reset_quiz", targetUser: OTHER, targetAlias: alias, adminId: ADMIN });
  });

  it("deletes an account and keeps the audit entry with the captured alias", async () => {
    const { deps, store } = await setup();
    const alias = store.users.get(OTHER)?.alias;
    expect((await runUserAction(actor, OTHER, "delete", deps)).ok).toBe(true);
    expect(store.users.has(OTHER)).toBe(false);
    expect(store.audit.at(-1)).toMatchObject({ action: "delete_user", targetAlias: alias });
  });

  it("refuses to delete an admin account, including your own", async () => {
    const { deps, store } = await setup();
    expect(await runUserAction(actor, ADMIN, "delete", deps)).toEqual({ ok: false, error: "admin.protected" });
    expect(store.users.has(ADMIN)).toBe(true);
    expect(store.audit).toHaveLength(0);
  });

  it("pauses, resumes and resets the chat PIN, each audited", async () => {
    const { deps, store } = await setup();
    await runUserAction(actor, OTHER, "pause", deps);
    expect(store.users.get(OTHER)?.paused).toBe(true);
    await runUserAction(actor, OTHER, "resume", deps);
    await runUserAction(actor, OTHER, "reset_chat_pin", deps);
    expect(store.users.get(OTHER)?.hasChatPin).toBe(false);
    expect(store.audit.map((e) => e.action)).toEqual(["pause_user", "resume_user", "reset_chat_pin"]);
  });

  it("answers admin.not_found for a missing account and audits nothing", async () => {
    const { deps, store } = await setup();
    expect(await runUserAction(actor, "cccccccc-0000-4000-8000-000000000003", "reset_quiz", deps)).toEqual({ ok: false, error: "admin.not_found" });
    expect(store.audit).toHaveLength(0);
  });

  it("audits recompute and report reviews; unknown reports are not found", async () => {
    const { deps, store } = await setup();
    store.reports.set("r1", "abierto");
    expect((await recomputeAudited(actor, deps)).ok).toBe(true);
    expect(await reviewReport(actor, "r1", "revisado", deps)).toEqual({ ok: true, value: undefined });
    expect(await reviewReport(actor, "nope", "cerrado", deps)).toEqual({ ok: false, error: "admin.not_found" });
    expect(store.reviewed).toEqual([{ adminId: ADMIN, reportId: "r1", status: "revisado" }]);
    expect(store.audit.map((e) => e.action)).toEqual(["recompute", "report_revisado"]);
    const audit = await listAudit(0, deps);
    expect(audit.ok && audit.value.total).toBe(2);
  });
});
