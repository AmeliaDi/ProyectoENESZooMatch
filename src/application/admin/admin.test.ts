import { describe, expect, it } from "vitest";

import { ADMIN_CONFIG } from "@/config";
import { MS_PER_MINUTE } from "@/domain/chat";

import { MemoryStore, instantScheduler, memoryMatches, memoryProfiles, plainPinHasher } from "../testing/in-memory";
import { MemoryAdmin, adminUser, hatchedIdentity, memoryAdminConsole } from "../testing/memory-admin";
import { adminLogin } from "./login";
import { bumpCounter } from "./counters";
import { chosenFilter, listAudit, listUsers, recomputeAudited, reviewReport, runUserAction } from "./users";

const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const MATRICULA = "900000001";
const PIN = "4826";
const START = new Date("2026-11-03T12:00:00.000Z");

const ADMIN_IDENTITY = hatchedIdentity({
  aliasCompleto: "observadora gris neblina · KMPQ",
  aliasAnimal: "observadora",
  aliasColor: "gris neblina",
});
const ADMIN_ALIAS = ADMIN_IDENTITY.aliasCompleto;

async function setup() {
  const store = new MemoryAdmin();
  store.users.set(ADMIN, adminUser(ADMIN, { isAdmin: true, identity: ADMIN_IDENTITY }));
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

const actor = { userId: ADMIN, identity: ADMIN_IDENTITY };

describe("admin login (ADR-036)", () => {
  it("opens with the right matrícula and PIN and audits the login", async () => {
    const { login, store } = await setup();
    expect(await adminLogin(MATRICULA, PIN, login)).toEqual({ ok: true, value: { userId: ADMIN, identity: ADMIN_IDENTITY } });
    expect(store.audit.map((e) => e.action)).toEqual(["login"]);
    expect(store.audit.at(-1)?.adminAlias).toBe(ADMIN_ALIAS);
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
    const page = await listUsers("observa", 0, {}, deps);
    expect(page).toMatchObject({ ok: true, value: { total: 1 } });
    expect(page.ok && page.value.users[0]?.id).toBe(ADMIN);
  });

  it("resets a quiz keeping the frozen identity, audits it and republishes matches", async () => {
    const { deps, store } = await setup();
    const identity = store.users.get(OTHER)?.identity;
    expect(await runUserAction(actor, OTHER, "reset_quiz", deps)).toEqual({ ok: true, value: { recomputePending: false } });
    expect(store.users.get(OTHER)).toMatchObject({ identity, quizCompletedAt: null, romanceMatches: 0 });
    expect(store.audit.at(-1)).toMatchObject({ action: "reset_quiz", targetUser: OTHER, targetAlias: identity?.aliasCompleto, adminId: ADMIN });
  });

  it("deletes an account and keeps the audit entry with the captured name", async () => {
    const { deps, store } = await setup();
    const alias = store.users.get(OTHER)?.identity.aliasCompleto;
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

describe("admin counters (ADR-036)", () => {
  it("steps a tally, clamps at zero in the base and leaves one audit row per move", async () => {
    const { deps, store } = await setup();
    expect(await bumpCounter(ADMIN, { key: "ligues", delta: 1 }, deps)).toEqual({
      ok: true, value: { key: "ligues", value: 1, antes: 0 },
    });
    expect(await bumpCounter(ADMIN, { key: "ligues", delta: -3 }, deps)).toEqual({
      ok: true, value: { key: "ligues", value: 0, antes: 1 },
    });
    expect(store.counters.get("ligues")).toBe(0);
    // One row, not two: the use case must not record the move the base already
    // recorded. `delta` is what was asked for, `antes`/`despues` what happened.
    expect(store.audit.map((e) => e.action)).toEqual(["counter_update", "counter_update"]);
    expect(store.audit[0]?.detail).toEqual({ key: "ligues", antes: 0, despues: 1, delta: 1 });
    expect(store.audit[1]?.detail).toEqual({ key: "ligues", antes: 1, despues: 0, delta: -3 });
    expect(store.audit[0]?.adminAlias).toBe(ADMIN_ALIAS);
  });

  it("corrects a tally to an exact value and keeps the two tallies apart", async () => {
    const { deps, store } = await setup();
    await bumpCounter(ADMIN, { key: "ligues", delta: 2 }, deps);
    expect(await bumpCounter(ADMIN, { key: "novios", set: 7 }, deps)).toEqual({
      ok: true, value: { key: "novios", value: 7, antes: 0 },
    });
    expect(store.counters.get("ligues")).toBe(2);
    expect(store.counters.get("novios")).toBe(7);
    expect(await bumpCounter(ADMIN, { key: "novios", set: 0 }, deps)).toEqual({
      ok: true, value: { key: "novios", value: 0, antes: 7 },
    });
    expect(store.audit[2]?.detail).toEqual({ key: "novios", antes: 7, despues: 0, delta: -7 });
  });
});

const HUEVO = "dddddddd-0000-4000-8000-000000000004";
const SIN_ROMANCE = "eeeeeeee-0000-4000-8000-000000000005";

describe("admin people listing (ADR-036)", () => {
  /** Four accounts that answer the facets one at a time. */
  async function pool() {
    const store = new MemoryAdmin();
    store.users.set(ADMIN, adminUser(ADMIN, {
      isAdmin: true, identity: ADMIN_IDENTITY, createdAt: "2026-11-01T00:00:00.000Z",
    }));
    store.users.set(OTHER, adminUser(OTHER, {
      identity: hatchedIdentity({ aliasCompleto: "cacomixate rojo lava · QQQQ", mbtiCode: "ENTJ" }),
      paused: true, romanceMatches: 5, amistadMatches: 5, createdAt: "2026-10-02T00:00:00.000Z",
    }));
    store.users.set(HUEVO, adminUser(HUEVO, {
      // An egg has read nothing: no name and no type code, as in the row.
      identity: hatchedIdentity({ estadoIdentidad: "huevo", aliasCompleto: null, mbtiCode: null }),
      romanceMatches: 0, amistadMatches: 0, createdAt: "2026-11-10T00:00:00.000Z",
    }));
    store.users.set(SIN_ROMANCE, adminUser(SIN_ROMANCE, {
      identity: hatchedIdentity({ aliasCompleto: "ajolote turquesa · MMMM" }),
      romanceMatches: 0, amistadMatches: 4, createdAt: "2026-11-05T18:30:00.000Z",
    }));
    const console = memoryAdminConsole(store);
    const pool2 = new MemoryStore();
    return {
      store,
      deps: { console, profiles: memoryProfiles(pool2), matches: memoryMatches(pool2), scheduler: instantScheduler },
      ids: async (filter: Parameters<typeof listUsers>[2]) => {
        const page = await listUsers("", 0, filter, { console });
        return page.ok ? page.value.users.map((u) => u.id) : [];
      },
    };
  }

  it("lists every account when nobody chose a facet", async () => {
    const { ids } = await pool();
    expect(await ids({})).toEqual([HUEVO, SIN_ROMANCE, ADMIN, OTHER]);
  });

  it("filters by state, pause, role and track with no affinity", async () => {
    const { ids } = await pool();
    expect(await ids({ estado: "huevo" })).toEqual([HUEVO]);
    expect(await ids({ pausado: "si" })).toEqual([OTHER]);
    expect(await ids({ soloAdmin: true })).toEqual([ADMIN]);
    expect(await ids({ sinAfinidad: "romance" })).toEqual([HUEVO, SIN_ROMANCE]);
    expect(await ids({ sinAfinidad: "amistad" })).toEqual([HUEVO]);
  });

  it("matches the type code whatever way it was typed", async () => {
    const { ids } = await pool();
    expect(await ids({ mbti: "entj" })).toEqual([OTHER]);
    expect(await ids({ mbti: "INFP" })).toEqual([SIN_ROMANCE, ADMIN]);
  });

  it("binds a range that includes both of the days it names", async () => {
    const { ids } = await pool();
    expect(await ids({ desde: "2026-11-01" })).toEqual([HUEVO, SIN_ROMANCE, ADMIN]);
    expect(await ids({ hasta: "2026-11-05" })).toEqual([SIN_ROMANCE, ADMIN, OTHER]);
    // One day, both ends inside it: the last day is a whole day, not a cut.
    expect(await ids({ desde: "2026-11-05", hasta: "2026-11-05" })).toEqual([SIN_ROMANCE]);
    expect(await ids({ desde: "2026-11-06", hasta: "2026-11-06" })).toEqual([]);
  });

  it("sorts by the column chosen, with the egg that has no name last", async () => {
    const { ids } = await pool();
    expect(await ids({ orden: "antiguas" })).toEqual([OTHER, ADMIN, SIN_ROMANCE, HUEVO]);
    expect(await ids({ orden: "nombre" })).toEqual([SIN_ROMANCE, OTHER, ADMIN, HUEVO]);
    expect(await ids({ orden: "masAfinidades" })).toEqual([OTHER, SIN_ROMANCE, ADMIN, HUEVO]);
    expect(await ids({ orden: "menosAfinidades" })).toEqual([HUEVO, ADMIN, SIN_ROMANCE, OTHER]);
  });

  it("pages by the configured size, so a second page is empty and the total is not", async () => {
    const { deps } = await pool();
    const page = await listUsers("", 0, {}, deps);
    expect(page.ok && page.value.total).toBe(4);
    const second = await listUsers("", 1, {}, deps);
    expect(second.ok && second.value.total).toBe(4);
    expect(second.ok && second.value.users).toEqual([]);
  });

  it("sends only the facets somebody actually chose", () => {
    expect(chosenFilter({})).toEqual({});
    // An untouched select is "todos": it does not travel at all.
    expect(chosenFilter({ mbti: "", desde: "", hasta: "", soloAdmin: false })).toEqual({});
    expect(chosenFilter({ mbti: "intj", soloAdmin: true })).toEqual({ mbti: "INTJ", soloAdmin: true });
  });
});
