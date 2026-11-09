import { describe, expect, it } from "vitest";

import {
  ADMIN_COUNTER_KEYS,
  ADMIN_ORDERS,
  adminUserFilterSchema,
  adminUserPageSchema,
  adminUserSchema,
  counterMoveSchema,
} from "./admin";

const ROW = {
  id: "353b18ea-7b41-4472-ad96-855cb1420641",
  identity: {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "ajolote azul cobalto · CDXV",
    aliasAnimal: "ajolote",
    aliasColor: "azul cobalto",
    aliasSufijo: "CDXV",
    animalId: "ajolote",
    colorId: "azul_cobalto",
    colorHex: "#1B3A8F",
    mbtiCode: "INTJ",
    enneagramCode: "5w4",
    mark: "sx",
    revelacionVista: true,
  },
  createdAt: "2026-11-06T18:00:00Z",
  quizCompletedAt: "2026-11-06T18:12:00Z",
  paused: false,
  adult: true,
  modules: 8,
  isAdmin: false,
  hasChatPin: true,
  romanceMatches: 12,
  amistadMatches: 30,
  conversations: 2,
  reportsReceived: 0,
};

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("admin console contract (ADR-036)", () => {
  it("reads the two new dates without breaking an older row", () => {
    const fila = adminUserSchema.parse(ROW);
    expect(fila.eclosionadoEn).toBeNull();
    expect(fila.eliminadoEn).toBeNull();

    const completa = adminUserSchema.parse({ ...ROW, eclosionadoEn: "2026-11-06T18:12:30Z", eliminadoEn: null });
    expect(completa.eclosionadoEn).toBe("2026-11-06T18:12:30Z");
    expect(completa.eliminadoEn).toBeNull();
    expect(adminUserPageSchema.parse({ total: 221, users: [ROW] }).total).toBe(221);
  });

  it("has one route to a name: the stored identity", () => {
    // A flat `alias` beside `identity` would be a second one; the contract
    // strips it instead of carrying it to the UI.
    expect(adminUserSchema.parse({ ...ROW, alias: "oso panda", color: "rosa" }).identity.aliasCompleto)
      .toBe(ROW.identity.aliasCompleto);
    // An egg has no alias yet — that is a real state, not a broken row.
    expect(ok(adminUserSchema, { ...ROW, identity: { ...ROW.identity, aliasCompleto: null } })).toBe(true);
    expect(ok(adminUserSchema, { ...ROW, identity: { ...ROW.identity, estadoIdentidad: "cascara" } })).toBe(false);
  });

  it("accepts only the facets the stored function whitelists", () => {
    for (const filter of [
      {},
      { estado: "huevo" },
      { estado: "eclosionado", pausado: "no" },
      { sinAfinidad: "romance" },
      { soloAdmin: true },
      { mbti: "intj" },
      { orden: "nombre" },
      { desde: "2026-11-01", hasta: "2026-11-08" },
      { estado: "eclosionado", sinAfinidad: "amistad", orden: "masAfinidades" },
    ]) expect(ok(adminUserFilterSchema, filter), JSON.stringify(filter)).toBe(true);
  });

  it("refuses a facet value the SQL would silently ignore", () => {
    // Typing it here is what lets the route say "no entiendo" instead of
    // quietly widening the list the admin is looking at.
    for (const filter of [
      { estado: "todos" },
      { pausado: "sí" },
      { sinAfinidad: "ambas" },
      // `soloAdmin` is a boolean in the app; the wire encodes it as "si".
      { soloAdmin: "si" },
      { mbti: "XXXX" },
      { mbti: "INTJ'; DROP TABLE profiles;--" },
      { orden: "afinidades" },
      { desde: "01/11/2026" },
      { hasta: "ayer" },
    ]) expect(ok(adminUserFilterSchema, filter), JSON.stringify(filter)).toBe(false);
  });

  it("lets a day that does not exist through: the base is the calendar", () => {
    // `2026-02-30` is well-formed, so the contract cannot judge it. The stored
    // function turns it into "sin filtro" instead of raising 22008 and killing
    // the whole read — measured in production before that helper existed.
    expect(ok(adminUserFilterSchema, { desde: "2026-02-30" })).toBe(true);
  });

  it("orders only by a column the whitelist names", () => {
    expect([...ADMIN_ORDERS]).toEqual(["recientes", "antiguas", "masAfinidades", "menosAfinidades", "nombre"]);
    for (const orden of ADMIN_ORDERS) expect(ok(adminUserFilterSchema, { orden })).toBe(true);
  });

  it("takes a counter move as a step or a correction, never both", () => {
    for (const move of [
      { key: "ligues", delta: 1 },
      { key: "ligues", delta: -1 },
      { key: "ligues", delta: 100 },
      { key: "novios", set: 0 },
      { key: "novios", set: 100_000 },
    ]) expect(ok(counterMoveSchema, move), JSON.stringify(move)).toBe(true);

    for (const move of [
      { key: "ligues" },
      { key: "ligues", delta: 1, set: 2 },
      { key: "ligues", delta: 101 },
      { key: "ligues", delta: -101 },
      { key: "ligues", delta: 1.5 },
      { key: "ligues", set: -1 },
      { key: "ligues", set: 100_001 },
      { key: "besos", delta: 1 },
      { key: "LIGUES", delta: 1 },
      { delta: 1 },
      {},
    ]) expect(ok(counterMoveSchema, move), JSON.stringify(move)).toBe(false);
  });

  it("names the counters the table seeds", () => {
    expect([...ADMIN_COUNTER_KEYS]).toEqual(["ligues", "novios"]);
    // Every key must satisfy the stored CHECK, or the RPC would refuse it.
    for (const key of ADMIN_COUNTER_KEYS) expect(key).toMatch(/^[a-z][a-z0-9_]{1,31}$/);
  });
});
