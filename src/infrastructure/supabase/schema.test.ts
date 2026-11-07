/**
 * Static checks that the base migration and the TypeScript adapters agree.
 * There is no database in CI, so these guard the contract textually.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FRIENDSHIP_VECTOR_LENGTH, QUIZ_MODULE_IDS, ROMANCE_VECTOR_LENGTH } from "@/types/microtest";
import { SHARE_LAYER_IDS } from "@/types/sharing";

import { RPC, TABLE } from "./repositories";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SQL = readFileSync(resolve(MIGRATIONS_DIR, "00000000000000_base.sql"), "utf8");
const SEED = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const IDENTITY_MIGRATION = "20261114000000_identity_single_source.sql";
const IDENTITY_SQL = lf(readFileSync(resolve(MIGRATIONS_DIR, IDENTITY_MIGRATION), "utf8"));
const IDENTITY_DROP_MIGRATION = "20261116000000_identity_drop_legacy.sql";
const IDENTITY_DROP_SQL = lf(readFileSync(resolve(MIGRATIONS_DIR, IDENTITY_DROP_MIGRATION), "utf8"));
const SOFT_DELETE_MIGRATION = "20261117000000_filter_soft_deleted_matches.sql";
const SOFT_DELETE_SQL = lf(readFileSync(resolve(MIGRATIONS_DIR, SOFT_DELETE_MIGRATION), "utf8"));

/** Every `CREATE FUNCTION public.x(...)` body, keyed by name, across migrations. */
function publicFunctionsOf(sql: string): [string, string][] {
  return [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(([\s\S]*?)\$\$;/g)].map((m) => [m[1]!, m[0]]);
}
const PUBLIC_FUNCTIONS = new Map([
  ...publicFunctionsOf(lf(SQL)),
  ...publicFunctionsOf(IDENTITY_SQL),
  ...publicFunctionsOf(SOFT_DELETE_SQL),
]);

const CHAT_MIGRATION = "20261102000000_chat_pin.sql";
const CHAT_SQL = readFileSync(resolve(MIGRATIONS_DIR, CHAT_MIGRATION), "utf8");
const CHAT_TABLES = ["chat_pins", "chat_security_events"] as const;
const SHARING_MIGRATION = "20261103000000_shared_layers.sql";
const SHARING_SQL = readFileSync(resolve(MIGRATIONS_DIR, SHARING_MIGRATION), "utf8");
const CONVERSATIONS_MIGRATION = "20261104000000_conversations.sql";
const CONVERSATIONS_SQL = readFileSync(resolve(MIGRATIONS_DIR, CONVERSATIONS_MIGRATION), "utf8");
const ALIAS_MIGRATION = "20261105000000_alias_collision.sql";
const ALIAS_SQL = readFileSync(resolve(MIGRATIONS_DIR, ALIAS_MIGRATION), "utf8");
const CONVERSATION_TABLES = ["chat_interests", "conversations", "conversation_answers", "conversation_messages"] as const;
const SAFETY_MIGRATION = "20261106000000_chat_safety.sql";
const SAFETY_SQL = readFileSync(resolve(MIGRATIONS_DIR, SAFETY_MIGRATION), "utf8");
const SAFETY_TABLES = [
  "conversation_rounds", "conversation_reactions", "chat_feedback_daily", "chat_blocks",
  "chat_closures", "chat_reports", "chat_report_audit",
] as const;
const SAFETY_RPCS = ["express_chat_interest", "leave_conversation", "block_chat_user", "report_conversation", "record_round_feedback", "purge_chat"] as const;
const ADMIN_MIGRATION = "20261107000000_admin_panel.sql";
const ADMIN_SQL = readFileSync(resolve(MIGRATIONS_DIR, ADMIN_MIGRATION), "utf8");
const ADMIN_TABLES = ["admin_credentials", "admin_audit"] as const;
const ADMIN_RPCS = ["admin_list_users", "admin_list_reports", "admin_reset_quiz", "admin_review_report"] as const;
const FASE1_MIGRATION = "20261108000000_fase1_idempotency_and_soft_delete.sql";
const FASE2_MIGRATION = "20261109000000_fase2_color_stability.sql";
const FASE2_SQL = readFileSync(resolve(MIGRATIONS_DIR, FASE2_MIGRATION), "utf8");
const FASE3_MIGRATION = "20261110000000_fase3_retention_policy.sql";
const FASE3_SQL = readFileSync(resolve(MIGRATIONS_DIR, FASE3_MIGRATION), "utf8");
const FASE4_MIGRATION = "20261111000000_fase4_chat_three_rounds.sql";
const FASE4_SQL = readFileSync(resolve(MIGRATIONS_DIR, FASE4_MIGRATION), "utf8");
const FASE5_MIGRATION = "20261112000000_fase5_match_notifications_idempotent.sql";
const FASE5_SQL = readFileSync(resolve(MIGRATIONS_DIR, FASE5_MIGRATION), "utf8");
const QUIZZES_MIGRATION = "20261120000000_quizzes.sql";
const QUIZZES_SQL = readFileSync(resolve(MIGRATIONS_DIR, QUIZZES_MIGRATION), "utf8");
const QUIZZES_TABLES = ["quiz_attempts", "quiz_answers", "quiz_sharing", "quiz_picante_consent"] as const;
const QUIZZES_RPCS = ["quiz_coincidencias"] as const;

describe("base migration", () => {
  it("is the base plus the idempotent incremental migrations", () => {
    expect(readdirSync(MIGRATIONS_DIR)).toEqual([
      "00000000000000_base.sql",
      CHAT_MIGRATION,
      SHARING_MIGRATION,
      CONVERSATIONS_MIGRATION,
      ALIAS_MIGRATION,
      SAFETY_MIGRATION,
      ADMIN_MIGRATION,
      FASE1_MIGRATION,
      FASE2_MIGRATION,
      FASE3_MIGRATION,
      FASE4_MIGRATION,
      FASE5_MIGRATION,
      IDENTITY_MIGRATION,
      IDENTITY_DROP_MIGRATION,
      SOFT_DELETE_MIGRATION,
      QUIZZES_MIGRATION,
    ]);
  });

  it("keeps shared layers in sync with the TypeScript ids and idempotent (ADR-030)", () => {
    const list = `ARRAY[\n    ${SHARE_LAYER_IDS.map((id) => `'${id}'`).join(", ")}\n  ]::TEXT[]`;
    expect(lf(SQL)).toContain(list);
    expect(lf(SHARING_SQL)).toContain(list);
    expect(SHARING_SQL).toContain("ADD COLUMN IF NOT EXISTS shared_layers TEXT[] NOT NULL DEFAULT '{}'");
    expect(SHARING_SQL).toContain("DROP CONSTRAINT IF EXISTS profiles_shared_layers_known");
    expect(SHARING_SQL).not.toMatch(/\b(DROP TABLE|TRUNCATE|DELETE FROM|GRANT)\b/);
  });

  it("uses no versioned names anywhere", () => {
    expect(SQL).not.toMatch(/_v\d\b/);
    expect(SEED).not.toMatch(/_v\d\b/);
  });

  it("defines every RPC and table the adapters call", () => {
    for (const name of Object.values(RPC)) {
      expect(PUBLIC_FUNCTIONS.has(name), `missing RPC ${name}`).toBe(true);
    }
    // Exclude quiz tables - they're in a separate migration
    const nonQuizTables = Object.values(TABLE).filter((name) => !name.startsWith("quiz_"));
    for (const name of nonQuizTables) {
      expect(SQL).toContain(`CREATE TABLE public.${name} (`);
    }
  });

  it("defines quiz tables and RPCs in quizzes migration", () => {
    for (const table of QUIZZES_TABLES) {
      expect(QUIZZES_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const rpc of QUIZZES_RPCS) {
      expect(QUIZZES_SQL).toContain(`CREATE OR REPLACE FUNCTION ${rpc}`);
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

  it("never renames an alias once assigned (ADR-024, now the golden rule)", () => {
    // Writing a name is no longer a side effect of submitting the test: the
    // only function that can do it returns the stored one when the person
    // already hatched, so nobody who has a name ever gets a different one.
    const hatch = PUBLIC_FUNCTIONS.get("hatch_profile_identity") ?? "";
    expect(hatch).toContain("IF v_estado = 'eclosionado' AND v_congelado IS NOT NULL THEN");
    expect(hatch).toContain("RETURN v_alias");
    expect(hatch).toContain("FOR UPDATE");
    expect(hatch).toContain("RETURNING public.profiles.alias_completo INTO v_alias");
    const submit = PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "";
    expect(submit).not.toContain("alias = COALESCE(public.profiles.alias");
    expect(submit).not.toContain("alias = p_alias");
  });

  it("resolves alias collisions with the unique index plus a deterministic retry (ADR-034)", () => {
    // The candidate suffix is built in `domain/identity/hatch-identity.ts` from
    // HMAC(server secret, user id); SQL only arbitrates the race.
    const hatch = PUBLIC_FUNCTIONS.get("hatch_profile_identity") ?? "";
    expect(hatch).toContain("alias % is already taken");
    expect(hatch).toContain("ERRCODE = '23505'");
    expect(IDENTITY_SQL).toContain("CREATE UNIQUE INDEX IF NOT EXISTS profiles_alias_completo_key");
    expect(lf(ALIAS_SQL)).toContain("md5(p_user_id::TEXT || v_attempt::TEXT)");
    expect(ALIAS_SQL).not.toMatch(/(DROP|TRUNCATE|DELETE FROM|GRANT|REVOKE)/);
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

  it("keeps the entry guard service-only and has no personal key (ADR-026)", () => {
    const guard = PUBLIC_FUNCTIONS.get("access_guard_hit");
    expect(guard).toContain("PERFORM private.assert_service_role();");
    expect(guard).toContain("SECURITY DEFINER");
    expect(PUBLIC_FUNCTIONS.has("access_guard_peek")).toBe(false);
    expect(PUBLIC_FUNCTIONS.has("access_guard_clear")).toBe(false);
    expect(SQL).toContain("CREATE TABLE private.access_guard");
    expect(SQL).not.toContain("access_key_hash");
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

describe("conversations migration (ADR-032)", () => {
  it("is idempotent and only deletes inside leave_conversation", () => {
    const sql = lf(CONVERSATIONS_SQL);
    expect(sql).not.toMatch(/\/\*|\*\//);
    expect(sql).not.toMatch(/^CREATE TABLE (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^CREATE (INDEX|FUNCTION|POLICY) (?!IF NOT EXISTS|OR REPLACE)/m);
    for (const [, name] of sql.matchAll(/^CREATE TRIGGER (\w+)/gm)) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS ${name} ON`);
    }
    expect(sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    const outside = sql.replace(/CREATE OR REPLACE FUNCTION public\.leave_conversation[\s\S]*?\$\$;/, "");
    expect(outside).not.toMatch(/\bDELETE FROM\b/);
  });


  it("matches the base migration table by table", () => {
    for (const table of CONVERSATION_TABLES) {
      const body = (sql: string, head: string) => lf(sql).match(new RegExp(`${head}public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      const incremental = body(CONVERSATIONS_SQL, "CREATE TABLE IF NOT EXISTS ");
      expect(incremental, table).toBeTruthy();
      expect(body(SQL, "CREATE TABLE ")).toBe(incremental);
    }
  });

  it("keeps chat data server-only: RLS on, no policies, no API grants", () => {
    for (const sql of [SQL, CONVERSATIONS_SQL]) {
      for (const table of CONVERSATION_TABLES) {
        expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
        expect(sql).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\b`));
      }
      expect(sql).not.toMatch(/GRANT [^;]*(conversation|chat_interests|express_chat_interest)[^;]* TO (anon|authenticated)/);
    }
  });

  it("opens a chat only for a current match and guards the RPCs", () => {
    for (const name of ["express_chat_interest", "leave_conversation"]) {
      const body = PUBLIC_FUNCTIONS.get(name) ?? "";
      expect(body, name).toContain("PERFORM private.assert_service_role();");
      expect(body, name).toContain("SECURITY DEFINER");
    }
    expect(PUBLIC_FUNCTIONS.get("express_chat_interest")).toContain("SELECT 1 FROM public.matches WHERE user_a = v_a AND user_b = v_b AND track = p_track");
    expect(PUBLIC_FUNCTIONS.get("leave_conversation")).toContain("WHERE id = p_id AND p_user IN (user_a, user_b)");
  });

  it("cascades every chat row from the account", () => {
    for (const sql of [SQL, CONVERSATIONS_SQL]) {
      const tables = CONVERSATION_TABLES.map((t) => lf(sql).match(new RegExp(`public\\.${t} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "");
      for (const body of tables) {
        for (const ref of body.match(/REFERENCES [^\n]+/g) ?? []) expect(ref).toContain("ON DELETE CASCADE");
      }
    }
  });

  it("accepts the content-free chat notification", () => {
    expect(SQL).toContain("'welcome', 'chat'))");
    expect(CONVERSATIONS_SQL).toContain("DROP CONSTRAINT IF EXISTS notifications_type_check");
  });
});

describe("chat safety migration (ADR-035)", () => {
  const functionBody = (sql: string, name: string) =>
    lf(sql).match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? "";

  it("is idempotent and never drops or truncates tables", () => {
    const sql = lf(SAFETY_SQL);
    expect(sql).not.toMatch(/\/\*|\*\//);
    expect(sql).not.toMatch(/^CREATE TABLE (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^CREATE (UNIQUE )?(INDEX|FUNCTION|POLICY) (?!IF NOT EXISTS|OR REPLACE)/m);
    for (const [, name] of sql.matchAll(/^CREATE TRIGGER (\w+)/gm)) expect(sql).toContain(`DROP TRIGGER IF EXISTS ${name} ON`);
    expect(sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS adult_confirmed_at/);
  });

  it("matches the base migration table by table", () => {
    for (const table of SAFETY_TABLES) {
      const body = (sql: string, head: string) => lf(sql).match(new RegExp(`${head}public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      const incremental = body(SAFETY_SQL, "CREATE TABLE IF NOT EXISTS ");
      expect(incremental, table).toBeTruthy();
      expect(body(SQL, "CREATE TABLE "), table).toBe(incremental);
    }
    for (const name of SAFETY_RPCS) {
      expect(functionBody(SQL, name).replace("CREATE FUNCTION", ""), name).toBe(functionBody(SAFETY_SQL, name).replace("CREATE OR REPLACE FUNCTION", ""));
    }
  });

  it("keeps chat safety data server-only and cascading from the account", () => {
    for (const sql of [SQL, SAFETY_SQL]) {
      for (const table of SAFETY_TABLES) {
        expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
        expect(sql).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\b`));
        const body = lf(sql).match(new RegExp(`public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
        for (const ref of body.match(/REFERENCES [^\n]+/g) ?? []) expect(ref, table).toContain("ON DELETE CASCADE");
      }
      expect(sql).not.toMatch(/GRANT [^;]*(chat_|conversation_|purge_chat|report_conversation)[^;]* TO (anon|authenticated)/);
    }
  });

  it("guards every RPC and enforces match, block, age and cooldown in the database", () => {
    for (const name of SAFETY_RPCS) {
      const body = PUBLIC_FUNCTIONS.get(name) ?? "";
      expect(body, name).toContain("PERFORM private.assert_service_role();");
      expect(body, name).toContain("SECURITY DEFINER");
      expect(body, name).toContain("SET search_path = ''");
    }
    const express = PUBLIC_FUNCTIONS.get("express_chat_interest") ?? "";
    for (const rule of ["FROM public.matches", "FROM public.chat_blocks", "adult_confirmed_at IS NOT NULL", "FROM public.chat_closures", "'too_many'"]) {
      expect(express, rule).toContain(rule);
    }
    expect(PUBLIC_FUNCTIONS.get("report_conversation")).toContain("'reporta' ELSE 'reportada'");
  });

  it("bounds text by graphemes × the code point margin", () => {
    for (const sql of [SQL, SAFETY_SQL]) {
      expect(sql).toContain("char_length(body) BETWEEN 1 AND 2400");
      expect(sql).toContain("char_length(custom_text) BETWEEN 1 AND 1600");
    }
  });
});

describe("chat PIN migration (ADR-029)", () => {
  it("is idempotent and safe on a populated schema", () => {
    expect(CHAT_SQL).not.toMatch(/\/\*|\*\//);
    expect(CHAT_SQL).not.toMatch(/^CREATE TABLE (?!IF NOT EXISTS)/m);
    expect(CHAT_SQL).not.toMatch(/^CREATE (INDEX|FUNCTION|POLICY) (?!IF NOT EXISTS|OR REPLACE)/m);
    for (const [, name] of CHAT_SQL.matchAll(/^CREATE TRIGGER (\w+)/gm)) {
      expect(CHAT_SQL).toContain(`DROP TRIGGER IF EXISTS ${name} ON`);
    }
    expect(CHAT_SQL).not.toMatch(/\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/);
    expect(CHAT_SQL).toContain("SET search_path = ''");
  });

  it("matches the base migration column by column", () => {
    for (const table of CHAT_TABLES) {
      const body = (sql: string, head: string) => sql.match(new RegExp(`${head}public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      const incremental = body(CHAT_SQL, "CREATE TABLE IF NOT EXISTS ");
      expect(incremental, table).toBeTruthy();
      expect(body(SQL, "CREATE TABLE ")).toBe(incremental);
    }
  });

  it("keeps PIN tables server-only: RLS on, no policies, no API grants", () => {
    for (const sql of [SQL, CHAT_SQL]) {
      for (const table of CHAT_TABLES) {
        expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
        expect(sql).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\b`));
      }
      expect(sql).toContain("REVOKE ALL ON public.chat_pins, public.chat_security_events FROM PUBLIC, anon, authenticated;");
      expect(sql).toContain("GRANT ALL ON public.chat_pins, public.chat_security_events TO service_role;");
      expect(sql).not.toMatch(/GRANT [^;]*chat_[^;]* TO (anon|authenticated)/);
    }
  });

  it("cascades from the account so deleting data deletes the PIN", () => {
    for (const sql of [SQL, CHAT_SQL]) {
      expect(sql).toContain("user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,");
      expect(sql).toContain("user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,");
    }
  });

  it("never stores the PIN, an address or content in events", () => {
    const events = CHAT_SQL.match(/public\.chat_security_events \(([\s\S]*?)\n\);/)?.[1] ?? "";
    expect(events).not.toMatch(/\b(pin|ip|address|content|body|device)\b/i);
  });

  it("lets the access guard accept the chat PIN kind", () => {
    expect(SQL).toContain("CHECK (kind IN ('address_attempt', 'chat_pin_address', 'admin_address'))");
    expect(CHAT_SQL).toContain("DROP CONSTRAINT IF EXISTS access_guard_kind_check");
    expect(CHAT_SQL).toContain("CHECK (kind IN ('address_attempt', 'chat_pin_address'))");
  });
});

describe("admin console migration (ADR-036)", () => {
  const fn = (sql: string, name: string) =>
    lf(sql).match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? "";

  it("is idempotent and never drops or truncates tables", () => {
    const sql = lf(ADMIN_SQL);
    expect(sql).not.toMatch(/\/\*|\*\//);
    expect(sql).not.toMatch(/^CREATE TABLE (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^CREATE (UNIQUE )?(INDEX|FUNCTION|POLICY) (?!IF NOT EXISTS|OR REPLACE)/m);
    for (const [, name] of sql.matchAll(/^CREATE TRIGGER (\w+)/gm)) expect(sql).toContain(`DROP TRIGGER IF EXISTS ${name} ON`);
    expect(sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
  });

  it("matches the base migration table by table and RPC by RPC", () => {
    for (const table of ADMIN_TABLES) {
      const body = (sql: string, head: string) => lf(sql).match(new RegExp(`${head}public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      const incremental = body(ADMIN_SQL, "CREATE TABLE IF NOT EXISTS ");
      expect(incremental, table).toBeTruthy();
      expect(body(SQL, "CREATE TABLE "), table).toBe(incremental);
    }
    for (const name of [...ADMIN_RPCS.filter((r) => r !== "admin_reset_quiz"), "get_admin_dashboard"]) {
      expect(fn(SQL, name).replace("CREATE FUNCTION", ""), name).toBe(fn(ADMIN_SQL, name).replace("CREATE OR REPLACE FUNCTION", ""));
    }
    expect(fn(SQL, "admin_reset_quiz").replace("CREATE FUNCTION", "")).toBe(
      fn(FASE2_SQL, "admin_reset_quiz").replace("CREATE OR REPLACE FUNCTION", ""),
    );
  });

  it("keeps admin tables server-only and the audit independent of the target account", () => {
    for (const sql of [SQL, ADMIN_SQL]) {
      for (const table of ADMIN_TABLES) {
        expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
        expect(sql).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\b`));
      }
      expect(sql).not.toMatch(/GRANT [^;]*admin_[^;]* TO (anon|authenticated)/);
      const audit = lf(sql).match(/public\.admin_audit \(([\s\S]*?)\n\);/)?.[1] ?? "";
      expect(audit).toContain("admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL");
      expect(audit).toMatch(/target_user UUID,\n/);
      expect(audit).not.toMatch(/\b(pin|matricula|ip|address)\b/i);
    }
  });

  it("guards every console RPC and never returns hashes, answers or θ", () => {
    for (const name of ADMIN_RPCS) {
      const body = PUBLIC_FUNCTIONS.get(name) ?? "";
      expect(body, name).toContain("PERFORM private.assert_service_role();");
      expect(body, name).toContain("SECURITY DEFINER");
      expect(body, name).toContain("SET search_path = ''");
    }
    const list = PUBLIC_FUNCTIONS.get("admin_list_users") ?? "";
    for (const secret of ["matricula_hash", "latent_profile", "romance_vector", "dimension_scores", "orientacion_sexual", "quiz_responses"]) {
      expect(list, secret).not.toContain(secret);
    }
  });

  it("resets a quiz by returning the person to an egg, identity included", () => {
    const reset = lf(PUBLIC_FUNCTIONS.get("admin_reset_quiz") ?? "");
    expect(reset).toContain("quiz_completed_at = NULL");
    // An admin reset means "start over": every identity column is cleared and
    // the state goes back to `huevo`, which is what the shape constraint needs.
    expect(reset).toContain("estado_identidad = 'huevo'");
    expect(reset).toContain("alias = NULL");
    expect(reset).toContain("alias_completo = NULL");
    expect(reset).toContain("eclosionado_en = NULL");
    expect(reset).toContain("revelacion_vista = false");
    expect(reset).toContain("DELETE FROM public.quiz_responses WHERE user_id = p_user;");
    expect(reset).toContain("DELETE FROM public.matches WHERE p_user IN (user_a, user_b);");
  });

  it("lets the dashboard answer the service role and the guard accept admin_address", () => {
    expect(PUBLIC_FUNCTIONS.get("get_admin_dashboard")).toContain("COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT private.is_admin(auth.uid())");
    for (const sql of [SQL, ADMIN_SQL]) expect(sql).toContain("'address_attempt', 'chat_pin_address', 'admin_address'");
  });
});

describe("fase 1 idempotency & soft-delete migration", () => {
  it("enforces unique constraints on profiles, ordered pairs on matches, single welcome per user, and soft-delete column", () => {
    const fase1Sql = lf(readFileSync(resolve(MIGRATIONS_DIR, FASE1_MIGRATION), "utf8"));
    expect(fase1Sql).not.toMatch(/\/\*|\*\//);
    expect(fase1Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    expect(fase1Sql).toContain("ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ");
    expect(fase1Sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS notifications_welcome_unique_idx");
    expect(SQL).toContain("matricula_hash TEXT NOT NULL UNIQUE CHECK (matricula_hash ~ '^[0-9a-f]{64}$')");
    expect(SQL).toContain("alias TEXT UNIQUE");
    expect(SQL).toContain("CONSTRAINT matches_ordered_pair CHECK (user_a < user_b)");
    expect(SQL).toContain("eliminado_en TIMESTAMPTZ");
    expect(SQL).toContain("notifications_welcome_unique_idx");
    const replaceFn = PUBLIC_FUNCTIONS.get("replace_matches") ?? "";
    expect(replaceFn).toContain("LEAST(m.user_a, m.user_b)");
    expect(replaceFn).toContain("GREATEST(m.user_a, m.user_b)");
  });
});

describe("fase 2 color stability migration", () => {
  it("keeps color_asignado_en and hands the color to the hatch, not to submit_quiz_result", () => {
    const fase2Sql = lf(FASE2_SQL);
    expect(fase2Sql).not.toMatch(/\/\*|\*\//);
    expect(fase2Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    expect(fase2Sql).toContain("ADD COLUMN IF NOT EXISTS color_asignado_en TIMESTAMPTZ");
    expect(SQL).toContain("color_asignado_en TIMESTAMPTZ");
    // The parameter stays in the signature so an older server build keeps resolving
    // during the deploy window, but it no longer moves the frozen colour.
    const submitFn = PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "";
    expect(submitFn).toContain("p_preserve_color BOOLEAN DEFAULT false");
    expect(submitFn).not.toContain("WHEN COALESCE(p_preserve_color, false)");
    expect(submitFn).not.toContain("color_asignado_en = CASE");
    const hatchFn = PUBLIC_FUNCTIONS.get("hatch_profile_identity") ?? "";
    expect(hatchFn).toContain("color_asignado_en = COALESCE(color_asignado_en, now())");
  });
});

describe("fase 3 retention policy migration", () => {
  it("defines apply_retention_policy guarded by service_role and returning counts only", () => {
    const fase3Sql = lf(FASE3_SQL);
    expect(fase3Sql).not.toMatch(/\/\*|\*\//);
    expect(fase3Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    const fn = PUBLIC_FUNCTIONS.get("apply_retention_policy") ?? "";
    expect(fn).toContain("PERFORM private.assert_service_role();");
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = ''");
    expect(fn).toContain("'softDeletedAbandoned'");
    expect(fn).toContain("'purgedReadNotifications'");
  });
});

describe("fase 4 chat three rounds migration", () => {
  it("restricts guided rounds to idx 0..2 and migrates >= 3 completed rounds to free chat", () => {
    const fase4Sql = lf(FASE4_SQL);
    expect(fase4Sql).not.toMatch(/\/\*|\*\//);
    expect(fase4Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    expect(fase4Sql).toContain("conversation_rounds_three_questions_check");
    expect(fase4Sql).toContain("conversation_answers_three_questions_check");
    expect(fase4Sql).toContain("conversation_reactions_three_questions_check");
    expect(SQL).toContain("conversation_rounds_three_questions_check CHECK (idx BETWEEN 0 AND 2) NOT VALID");
    expect(SQL).toContain("conversation_answers_three_questions_check CHECK (round BETWEEN 0 AND 2) NOT VALID");
    expect(SQL).toContain("conversation_reactions_three_questions_check CHECK (idx BETWEEN 0 AND 2) NOT VALID");
  });
});

describe("fase 5 idempotent match notifications migration", () => {
  it("tracks match_set_hash in notify_matches so unchanged match sets do not emit duplicate notifications", () => {
    const fase5Sql = lf(FASE5_SQL);
    expect(fase5Sql).not.toMatch(/\/\*|\*\//);
    expect(fase5Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    const fn = PUBLIC_FUNCTIONS.get("notify_matches") ?? "";
    expect(fn).toContain("PERFORM private.assert_service_role();");
    expect(fn).toContain("match_set_hash");
    expect(fn).toContain("v_last_romance_hash IS DISTINCT FROM v_romance_hash");
    expect(fn).toContain("v_last_amistad_hash IS DISTINCT FROM v_amistad_hash");
  });
});

/**
 * The identity contract, checked textually because CI has no database.
 * Each assertion is one clause of the golden rule: the name is stored, unique,
 * uneditable after hatching, absent while in the egg, and never reassembled.
 */
describe("identity single source migration", () => {
  const COLUMNS = [
    "estado_identidad",
    "alias_animal",
    "alias_color",
    "alias_sufijo",
    "alias_completo",
    "enneagram_code",
    "eclosionado_en",
    "revelacion_vista",
  ];

  it("adds every identity column and keeps both states well formed", () => {
    for (const column of COLUMNS) {
      expect(IDENTITY_SQL).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(IDENTITY_SQL).toContain("CHECK (estado_identidad IN ('huevo', 'eclosionado'))");
    expect(IDENTITY_SQL).toContain("profiles_enneagram_code_format");
    expect(IDENTITY_SQL).toMatch(/enneagram_code ~ '\^\[1-9\]\(w\[1-9\]\)\?\$'/);
  });

  it("an egg carries no animal, colour or alias at all", () => {
    expect(IDENTITY_SQL).toContain("profiles_identity_shape");
    expect(IDENTITY_SQL).toContain("WHEN 'huevo' THEN");
    for (const column of ["animal_id", "color_id", "alias", "alias_animal", "alias_color", "alias_sufijo", "alias_completo", "eclosionado_en"]) {
      expect(IDENTITY_SQL).toContain(`${column} IS NULL`);
    }
  });

  it("makes the canonical name unique and non-editable", () => {
    expect(IDENTITY_SQL).toContain("CREATE UNIQUE INDEX IF NOT EXISTS profiles_alias_completo_key");
    expect(IDENTITY_SQL).toContain("private.reject_identity_mutation()");
    expect(IDENTITY_SQL).toContain("CREATE TRIGGER profiles_identity_immutable");
    expect(IDENTITY_SQL).toContain("RAISE EXCEPTION 'identity is frozen after hatching");
    // The suffix alphabet is 21 letters, no vowels, exactly four of them.
    expect(IDENTITY_SQL).toContain("[BCDFGHJKLMNPQRSTVWXYZ]{4}");
  });

  it("hatches once, idempotently, and lets the unique index break ties", () => {
    const fn = PUBLIC_FUNCTIONS.get("hatch_profile_identity") ?? "";
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("RETURN v_alias");
    expect(fn).toContain("ERRCODE = '23505'");
    expect(fn).toContain("eclosionado_en = now()");
    expect(fn).toContain("public.animals");
    expect(fn).toContain("public.colors");
  });

  it("writes the submission and the hatch inside one function, so one transaction covers both", () => {
    const fn = PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "";
    expect(fn).toContain("public.hatch_profile_identity(");
    // `p_alias` is ignored: the three parts are the only way in.
    expect(fn).not.toMatch(/alias\s*=\s*p_alias\b/);
    // The emblem is only ever written by the hatch itself.
    expect(fn).not.toContain("avatar_mark = p_avatar_mark");
  });

  it("reads names from the stored record and never reassembles them", () => {
    const matches = PUBLIC_FUNCTIONS.get("get_user_matches") ?? "";
    for (const column of ["other_alias", "other_animal", "other_color"]) {
      expect(matches).not.toContain(column);
    }
    expect(matches).toContain("p.estado_identidad = 'eclosionado'");

    const notify = PUBLIC_FUNCTIONS.get("notify_matches") ?? "";
    expect(notify).toContain("COALESCE(p.alias_completo, p.alias)");
    expect(notify).not.toContain("p.alias_animal || ' ' || p.alias_color");
    // A notification never announces a match for somebody still in the egg.
    expect(notify).toContain("v_estado = 'huevo'");

    const list = PUBLIC_FUNCTIONS.get("admin_list_users") ?? "";
    expect(list).toContain("p.alias_completo");
    expect(list).toContain("p.estado_identidad");
    // The console gets one nested `identity` object: the stored record
    // projected, never a flat name assembled here or from the catalogue.
    expect(list).toContain("'identity', jsonb_build_object(");
    for (const field of [
      "'estadoIdentidad', p.estado_identidad",
      "'aliasCompleto', p.alias_completo",
      "'aliasAnimal', p.alias_animal",
      "'aliasColor', p.alias_color",
      "'aliasSufijo', p.alias_sufijo",
      "'animalId', p.animal_id",
      "'colorId', p.color_id",
      "'mbtiCode', p.mbti_code",
      "'enneagramCode', p.enneagram_code",
      "'mark', p.avatar_mark",
      "'revelacionVista', p.revelacion_vista",
    ]) {
      expect(list, field).toContain(field);
    }
    // A flat `alias`/`animal`/`color`/`mbti` field is a second route to a name.
    for (const flat of ["'alias'", "'animal'", "'color'", "'mbti'"]) {
      expect(list, flat).not.toContain(flat);
    }
    // Searching a legacy alias would keep the dropped column alive.
    expect(list.match(/alias_completo, ''\) ILIKE v_pattern/g)?.length).toBe(2);
    expect(list).not.toMatch(/p\.alias[,)]/);

    // Metrics aggregate over the stored record; an egg has no animal or colour,
    // so it is counted separately and stays out of both breakdowns.
    const dashboard = PUBLIC_FUNCTIONS.get("get_admin_dashboard") ?? "";
    expect(dashboard).toContain("'huevos', (SELECT count(*) FROM public.profiles WHERE estado_identidad = 'huevo')");
    expect(dashboard).toContain("jsonb_build_object('id', t.id, 'name', t.name, 'count', t.total)");
    expect(dashboard).toContain("GROUP BY p.animal_id, a.diminutivo_es");
    expect(dashboard).toContain("GROUP BY p.color_id, c.nombre");
    expect(dashboard.match(/WHERE p\.estado_identidad = 'eclosionado'/g)?.length).toBe(2);

    // Moderation names the people from the frozen alias too.
    const reports = PUBLIC_FUNCTIONS.get("admin_list_reports") ?? "";
    expect(reports).toContain("'reporterAlias', rp.alias_completo");
    expect(reports).toContain("'reportedAlias', rd.alias_completo");
    expect(reports).not.toMatch(/r[pd]\.alias[,)]/);

    // No SQL anywhere concatenates a catalogue diminutive with a colour name.
    expect(IDENTITY_SQL).not.toMatch(/diminutivo_es\s*\|\|\s*' '\s*\|\|\s*\w*\.?nombre/);
    expect(IDENTITY_SQL).not.toMatch(/a\.diminutivo_es\s*\|\|\s*' '\s*\|\|\s*c\.nombre/);
  });

  it("hides soft-deleted people from every read that names them", () => {
    // `eliminado_en` marks a person for deletion, but their row — and the
    // `matches` rows that point at it — survive until the purge deletes the
    // account. Every read that spells a counterpart's name has to skip them.
    const matches = PUBLIC_FUNCTIONS.get("get_user_matches") ?? "";
    expect(matches).toContain("AND p.eliminado_en IS NULL");
    expect(matches).toContain("p.estado_identidad = 'eclosionado'");

    // The migration redefines the same signature, in a transaction, and says
    // so: that is what lets `db-apply -- --migration` run it on a live schema.
    expect(SOFT_DELETE_SQL).toMatch(/^BEGIN;/m);
    expect(SOFT_DELETE_SQL).toMatch(/^COMMIT;/m);
    expect(SOFT_DELETE_SQL).toMatch(/idempotente/i);
    expect(SOFT_DELETE_SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.get_user_matches\(p_user_id UUID\)/);
    expect(SOFT_DELETE_SQL).not.toMatch(/^\s*DROP FUNCTION/m);
    expect(SOFT_DELETE_SQL).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE public\.profiles)\b/);
    // Same grants as the step that created the function, no wider.
    expect(SOFT_DELETE_SQL).toContain("GRANT EXECUTE ON FUNCTION public.get_user_matches(UUID) TO service_role");
    expect(SOFT_DELETE_SQL).toContain(
      "REVOKE ALL ON FUNCTION public.get_user_matches(UUID) FROM PUBLIC, anon, authenticated",
    );

    // The two reads the adapters build themselves filter the same column.
    const profileRepo = lf(readFileSync(resolve(process.cwd(), "src/infrastructure/supabase/profile-repository.ts"), "utf8"));
    const chatRepo = lf(readFileSync(resolve(process.cwd(), "src/infrastructure/chat/conversation-repository.ts"), "utf8"));
    expect(profileRepo).toMatch(/\.in\("user_id", \[\.\.\.userIds\]\),?\s*\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*\.is\("eliminado_en", null\)/);
    expect(chatRepo.match(/\.is\("eliminado_en", null\)/g)?.length).toBe(2);

    // The in-memory adapters model the same contract, so a use-case test that
    // deletes somebody mid-flight sees what production would return.
    const harness = lf(readFileSync(resolve(process.cwd(), "src/application/testing/in-memory.ts"), "utf8"));
    expect(harness).toContain("readonly softDeleted = new Set<string>();");
    expect(harness).toMatch(/if \(store\.softDeleted\.has\(otherId\)\) continue;/);
    expect(harness).toMatch(/if \(!rec \|\| !identity \|\| gone\(id\)\) return \[\];/);
  });

  it("keeps the reset path honest: an admin reset returns the person to an egg", () => {
    const fn = PUBLIC_FUNCTIONS.get("admin_reset_quiz") ?? "";
    for (const column of COLUMNS) {
      expect(fn).toContain(`${column} = `);
    }
    expect(fn).toContain("estado_identidad = 'huevo'");
    expect(fn).toContain("revelacion_vista = false");
  });

  it("runs in one transaction and is repeatable", () => {
    expect(IDENTITY_SQL).toMatch(/^BEGIN;/m);
    expect(IDENTITY_SQL).toMatch(/^COMMIT;/m);
    expect(IDENTITY_SQL).toContain("ADD COLUMN IF NOT EXISTS");
    expect(IDENTITY_SQL).toContain("DROP CONSTRAINT IF EXISTS");
    expect(IDENTITY_SQL).toContain("CREATE OR REPLACE FUNCTION");
    expect(IDENTITY_SQL).toContain("DROP TRIGGER IF EXISTS");
    // The only destructive verbs are scoped UPDATEs on profiles.
    expect(IDENTITY_SQL).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
  });

  it("step 2 only drops what the new read path has already stopped using", () => {
    expect(IDENTITY_DROP_SQL).toMatch(/^BEGIN;/m);
    expect(IDENTITY_DROP_SQL).toMatch(/^COMMIT;/m);
    expect(IDENTITY_DROP_SQL).toContain("DROP COLUMN IF EXISTS alias");
    expect(IDENTITY_DROP_SQL).toContain("IF EXISTS");
    // It never drops the canonical columns.
    for (const column of ["alias_completo", "alias_animal", "alias_color", "alias_sufijo", "estado_identidad"]) {
      expect(IDENTITY_DROP_SQL).not.toContain(`DROP COLUMN IF EXISTS ${column}`);
    }
    // Every object that still touched the legacy column is rewritten first.
    for (const [qualifier, name] of [
      ["private", "reject_identity_mutation"],
      ["public", "hatch_profile_identity"],
      ["public", "admin_reset_quiz"],
      ["public", "notify_matches"],
      ["public", "submit_quiz_result"],
    ]) {
      expect(IDENTITY_DROP_SQL, name).toContain(`CREATE OR REPLACE FUNCTION ${qualifier}.${name}(`);
    }
    // After those rewrites the only mentions left are the precondition that
    // proves the column is redundant, its two error texts and the DROP itself.
    const code = lf(IDENTITY_DROP_SQL)
      .split("\n")
      .map((line) => line.split("--")[0])
      .join("\n");
    expect(code).not.toMatch(/(?:\b\w+)\.alias(?![A-Za-z0-9_])/);
    expect(code).not.toMatch(/^\s*alias\s*=/m);
    const trigger = IDENTITY_DROP_SQL.match(/CREATE TRIGGER profiles_identity_immutable[\s\S]*?EXECUTE FUNCTION/)?.[0] ?? "";
    expect(trigger).not.toMatch(/[,( ]alias[,\s)]/);
    // The console functions are not rewritten twice: step 1 already reads only
    // `alias_completo`, so a second version would be a second read path.
    for (const name of ["get_user_matches", "admin_list_users", "admin_list_reports", "get_admin_dashboard"]) {
      expect(IDENTITY_DROP_SQL, name).not.toContain(`FUNCTION public.${name}(`);
    }
  });

  it("leaves no live name read on the legacy column", () => {
    for (const [name, definition] of PUBLIC_FUNCTIONS) {
      const code = lf(definition)
        .split("\n")
        .map((line) => line.split("--")[0])
        .join("\n");
      if (name === "notify_matches") {
        // The one deliberate fallback, and it disappears in step 2.
        expect(code).toContain("COALESCE(p.alias_completo, p.alias)");
        continue;
      }
      expect(code, name).not.toMatch(/\w\.alias(?![A-Za-z0-9_])/);
    }
  });

  it("adds the identity notice as one typed event per person", () => {
    expect(IDENTITY_SQL).toContain(
      "CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome', 'chat', 'identity'))",
    );
    expect(IDENTITY_SQL).toContain("CREATE UNIQUE INDEX IF NOT EXISTS notifications_identity_unique_idx");
    expect(IDENTITY_SQL).toContain("ON public.notifications (user_id) WHERE type = 'identity'");
  });
});
