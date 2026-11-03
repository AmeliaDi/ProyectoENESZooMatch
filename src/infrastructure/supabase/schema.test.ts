/**
 * Static checks that the base migration and the TypeScript adapters agree.
 * There is no database in CI, so these guard the contract textually.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FRIENDSHIP_VECTOR_LENGTH, QUIZ_MODULE_IDS, ROMANCE_VECTOR_LENGTH } from "@/types/microtest";

import { RPC, TABLE } from "./repositories";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SQL = readFileSync(resolve(MIGRATIONS_DIR, "00000000000000_base.sql"), "utf8");
const SEED = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

/** Every `CREATE FUNCTION public.x(...)` body, keyed by name. */
const PUBLIC_FUNCTIONS = new Map(
  [...SQL.matchAll(/CREATE FUNCTION public\.(\w+)\(([\s\S]*?)\$\$;/g)].map((m) => [m[1]!, m[0]]),
);

describe("base migration", () => {
  it("is the only migration", () => {
    expect(readdirSync(MIGRATIONS_DIR)).toEqual(["00000000000000_base.sql"]);
  });

  it("uses no versioned names anywhere", () => {
    expect(SQL).not.toMatch(/_v\d\b/);
    expect(SEED).not.toMatch(/_v\d\b/);
  });

  it("defines every RPC and table the adapters call", () => {
    for (const name of Object.values(RPC)) {
      expect(PUBLIC_FUNCTIONS.has(name), `missing RPC ${name}`).toBe(true);
    }
    for (const name of Object.values(TABLE)) {
      expect(SQL).toContain(`CREATE TABLE public.${name} (`);
    }
  });

  it("matches the TypeScript vector lengths", () => {
    expect(SQL).toContain(`cardinality(romance_vector) = ${ROMANCE_VECTOR_LENGTH}`);
    expect(SQL).toContain(`cardinality(amistad_vector) = ${FRIENDSHIP_VECTOR_LENGTH}`);
    expect(SQL).toContain(`cardinality(p_romance_vector), 0) <> ${ROMANCE_VECTOR_LENGTH}`);
    expect(SQL).toContain(`cardinality(p_amistad_vector), 0) <> ${FRIENDSHIP_VECTOR_LENGTH}`);
  });

  it("accepts exactly the optional quiz modules in completed_modules", () => {
    const list = SQL.match(/completed_modules <@ ARRAY\[([\s\S]*?)\]/)?.[1] ?? "";
    const ids = [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(QUIZ_MODULE_IDS.filter((id) => id !== "nucleo"));
    expect(PUBLIC_FUNCTIONS.get("submit_quiz_result")).toContain("p_completed_modules TEXT[]");
  });

  it("pins search_path on every function", () => {
    const all = [...SQL.matchAll(/CREATE FUNCTION [\s\S]*?\$\$;/g)].map((m) => m[0]);
    expect(all.length).toBeGreaterThan(10);
    for (const body of all) {
      expect(body, body.slice(0, 60)).toContain("SET search_path = ''");
    }
  });

  it("guards service RPCs with the NULL-safe role check", () => {
    for (const name of ["submit_quiz_result", "get_pool_version", "replace_matches", "get_user_matches", "notify_matches"]) {
      expect(PUBLIC_FUNCTIONS.get(name), name).toContain("PERFORM private.assert_service_role();");
    }
    expect(SQL).toContain("COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'");
    expect(SQL).not.toMatch(/auth\.jwt\(\) ->> 'role' !=/);
  });

  it("keeps the entry guard service-only and the key hash private (ADR-023)", () => {
    for (const name of ["access_guard_hit", "access_guard_peek", "access_guard_clear"]) {
      expect(PUBLIC_FUNCTIONS.get(name), name).toContain("PERFORM private.assert_service_role();");
      expect(PUBLIC_FUNCTIONS.get(name), name).toContain("SECURITY DEFINER");
    }
    expect(SQL).toContain("CREATE TABLE private.access_guard");
    expect(SQL).toMatch(/access_key_hash TEXT CHECK/);
    expect(SQL).not.toMatch(/GRANT[^;]*access_guard[^;]*TO (anon|authenticated)/);
  });

  it("never grants participant tables or service RPCs to API roles", () => {
    expect(SQL).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;");
    expect(SQL).toContain("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;");
    const grants = [...SQL.matchAll(/GRANT [^;]+ TO (anon|authenticated)[^;]*;/g)].map((m) => m[0]);
    for (const grant of grants) {
      expect(grant).not.toMatch(/profiles|quiz_responses|matches\b|notifications\b|submit_quiz|replace_matches|get_user_matches|notify_matches|get_pool_version/);
    }
  });

  it("versions the pool with a trigger-maintained counter, not timestamps", () => {
    expect(SQL).toContain("AFTER UPDATE OF quiz_completed_at ON public.profiles");
    expect(SQL).toContain("AFTER DELETE ON public.profiles");
    expect(SQL).toContain("AFTER UPDATE OF paused_at ON public.profiles");
    expect(SQL).toMatch(/private\.pool_version\(\) IS DISTINCT FROM p_pool_version/);
  });

  it("uses only line comments (safe for the CLI statement splitter)", () => {
    expect(SQL).not.toMatch(/\/\*|\*\//);
  });

  it("keeps the seed idempotent for every catalogue table", () => {
    const inserts = SEED.match(/INSERT INTO public\.\w+/g) ?? [];
    const upserts = SEED.match(/ON CONFLICT \(id\) DO UPDATE/g) ?? [];
    expect(inserts).toEqual(["INSERT INTO public.animals", "INSERT INTO public.colors", "INSERT INTO public.quiz_items"]);
    expect(upserts).toHaveLength(inserts.length);
  });

  it("does not let a match summary erase an unread welcome", () => {
    expect(PUBLIC_FUNCTIONS.get("notify_matches")).toContain(
      "AND type IN ('match_romance', 'match_amistad', 'no_match')",
    );
  });

  it("keeps notification copy free of emojis", () => {
    const notify = PUBLIC_FUNCTIONS.get("notify_matches") ?? "";
    expect(notify).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(notify.toLowerCase()).not.toContain("perfecci");
  });

  it("keeps participant tables free of client policies", () => {
    expect(SQL).not.toMatch(/CREATE POLICY \w+ ON public\.(profiles|quiz_responses|matches|notifications)\b/);
  });
});
