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

/** Every `CREATE FUNCTION public.x(...)` body, keyed by name. */
const PUBLIC_FUNCTIONS = new Map(
  [...SQL.matchAll(/CREATE FUNCTION public\.(\w+)\(([\s\S]*?)\$\$;/g)].map((m) => [m[1]!, m[0]]),
);

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
const lf = (s: string) => s.replace(/\r\n/g, "\n");

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

  it("never renames an alias once assigned (ADR-024)", () => {
    const body = PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "";
    expect(body).toContain("alias = COALESCE(public.profiles.alias, v_candidate)");
    expect(body).toContain("RETURNS TEXT");
    expect(body).toContain("RETURNING public.profiles.alias INTO v_alias");
  });

  it("resolves alias collisions with a deterministic suffix in base and migration (ADR-034)", () => {
    const body = lf(PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "");
    expect(body).toContain("WHERE alias = v_candidate AND user_id <> p_user_id");
    expect(body).toContain("md5(p_user_id::TEXT || v_attempt::TEXT)");
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

  it("resets a quiz keeping the alias and satisfying profiles_completed_is_whole", () => {
    const reset = lf(PUBLIC_FUNCTIONS.get("admin_reset_quiz") ?? "");
    expect(reset).toContain("quiz_completed_at = NULL");
    expect(reset).not.toMatch(/\balias\s*=/);
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
  it("adds color_asignado_en and preserves color_id in submit_quiz_result when p_preserve_color is true", () => {
    const fase2Sql = lf(FASE2_SQL);
    expect(fase2Sql).not.toMatch(/\/\*|\*\//);
    expect(fase2Sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/);
    expect(fase2Sql).toContain("ADD COLUMN IF NOT EXISTS color_asignado_en TIMESTAMPTZ");
    expect(SQL).toContain("color_asignado_en TIMESTAMPTZ");
    const submitFn = PUBLIC_FUNCTIONS.get("submit_quiz_result") ?? "";
    expect(submitFn).toContain("p_preserve_color BOOLEAN DEFAULT false");
    expect(submitFn).toContain("WHEN COALESCE(p_preserve_color, false) AND public.profiles.color_id IS NOT NULL");
    expect(submitFn).toContain("color_asignado_en = CASE");
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
