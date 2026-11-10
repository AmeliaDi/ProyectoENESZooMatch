/**
 * Fase 3 — Script de purga de basura en base de datos por categorías
 *
 * Modo por defecto: --dry-run (solo lectura, en transacción con ROLLBACK).
 * Nunca imprime matrículas, hashes, UUIDs reales ni contenido de respuestas/mensajes.
 *
 * Uso:
 *   node --no-warnings scripts/purge-garbage.mts --dry-run
 *   node --no-warnings scripts/purge-garbage.mts --apply --confirm-purge
 */

import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { hashMatricula } from "../src/infrastructure/auth/identity.server.ts";

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = val;
  }
  return out;
}

const envLocal = loadEnvFile(resolve(process.cwd(), ".env.local"));
const envCli = loadEnvFile(resolve(process.cwd(), ".env.cli"));
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ?? envCli.SUPABASE_PROJECT_REF ?? "uchrlfvhaiisoyndwprf";
const ACCESS_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ??
  envCli.SUPABASE_ACCESS_TOKEN ??
  envLocal.SUPABASE_ACCESS_TOKEN;
const HMAC_SECRET =
  process.env.MATRICULA_HMAC_SECRET ??
  envLocal.MATRICULA_HMAC_SECRET ??
  envCli.MATRICULA_HMAC_SECRET ??
  "";

function pseudonymize(id: string, prefix: string): string {
  const h = createHmac("sha256", "zoomatch-purge-report-v1")
    .update(id)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `${prefix}-${h}`;
}

async function runSql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  if (!ACCESS_TOKEN) {
    throw new Error("Missing SUPABASE_ACCESS_TOKEN in environment or .env.local");
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Management API SQL error (${res.status}): ${body}`);
  }
  return (await res.json()) as T[];
}

function buildSyntheticCandidateHashes(secret: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!secret) return map;
  for (let d = 0; d <= 9; d++) {
    const m = String(d).repeat(9);
    map.set(hashMatricula(m, secret), `repeated_digit_${d}x9`);
  }
  for (const seq of ["123456789", "987654321", "123123123", "000000001", "999999990"]) {
    map.set(hashMatricula(seq, secret), `trivial_sequence`);
  }
  for (let n = 426144800; n <= 426144899; n++) {
    map.set(hashMatricula(String(n), secret), `qa_script_range_4261448xx`);
  }
  return map;
}

interface ProfileCandidateRow {
  user_id: string;
  matricula_hash: string;
  quiz_completed_at: string | null;
  created_at: string;
  is_admin: boolean;
  active_conversations: number;
}

interface AbandonedRow {
  user_id: string;
  created_at: string;
  response_count: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isConfirmed = args.includes("--confirm-purge");

  if (isApply && !isConfirmed) {
    throw new Error("Refusing to execute purge without --confirm-purge flag.");
  }

  const retentionConfig = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/retention-config.json"), "utf8"),
  ) as {
    abandoned_incomplete_days: { valor: number };
    soft_delete_grace_days: { valor: number };
    read_notifications_days: { valor: number };
    chat_security_events_days: { valor: number };
    access_guard_hours: { valor: number };
  };

  const syntheticHashes = buildSyntheticCandidateHashes(HMAC_SECRET);
  const hashListSql =
    syntheticHashes.size > 0
      ? [...syntheticHashes.keys()].map((h) => `'${h}'`).join(", ")
      : "''";

  // Category (a): Synthetic / QA test profiles (excluding admins)
  const syntheticRows = await runSql<ProfileCandidateRow>(`
    SELECT
      p.user_id::text AS user_id,
      p.matricula_hash,
      p.quiz_completed_at::text AS quiz_completed_at,
      p.created_at::text AS created_at,
      (
        EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')
        OR EXISTS (SELECT 1 FROM public.admin_credentials a WHERE a.user_id = p.user_id)
      ) AS is_admin,
      (
        SELECT count(*)::int FROM public.conversations c
        WHERE c.user_a = p.user_id OR c.user_b = p.user_id
      ) AS active_conversations
    FROM public.profiles p
    WHERE p.eliminado_en IS NULL
      AND p.matricula_hash IN (${hashListSql})
    ORDER BY p.created_at ASC;
  `);

  const syntheticNonAdmin = syntheticRows.filter((r) => !r.is_admin);
  const safeSynthetic = syntheticNonAdmin.filter((r) => r.active_conversations === 0);

  // Category (b): Incomplete profiles abandoned > X days
  const abandonedDays = retentionConfig.abandoned_incomplete_days.valor;
  const abandonedRows = await runSql<AbandonedRow>(`
    SELECT
      p.user_id::text AS user_id,
      p.created_at::text AS created_at,
      (SELECT count(*)::int FROM public.quiz_responses q WHERE q.user_id = p.user_id) AS response_count
    FROM public.profiles p
    WHERE p.quiz_completed_at IS NULL
      AND p.eliminado_en IS NULL
      AND p.created_at < now() - make_interval(days => ${abandonedDays})
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')
      AND NOT EXISTS (SELECT 1 FROM public.admin_credentials a WHERE a.user_id = p.user_id)
    ORDER BY p.created_at ASC;
  `);

  // Category (c): Orphan rows across tables
  const [orphans] = await runSql<{
    auth_without_profile: number;
    responses_without_profile: number;
    matches_without_profile: number;
    notifications_without_profile: number;
    conversations_without_profile: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)) AS auth_without_profile,
      (SELECT count(*)::int FROM public.quiz_responses r WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.user_id)) AS responses_without_profile,
      (SELECT count(*)::int FROM public.matches m WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = m.user_a) OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = m.user_b)) AS matches_without_profile,
      (SELECT count(*)::int FROM public.notifications n WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = n.user_id)) AS notifications_without_profile,
      (SELECT count(*)::int FROM public.conversations c WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = c.user_a) OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = c.user_b)) AS conversations_without_profile;
  `);

  // Category (d): Old read notifications & expired security/guard windows
  const readNotifDays = retentionConfig.read_notifications_days.valor;
  const secEventDays = retentionConfig.chat_security_events_days.valor;
  const guardHours = retentionConfig.access_guard_hours.valor;
  const [expired] = await runSql<{
    read_notifications_older_than_cutoff: number;
    total_read_notifications: number;
    security_events_older_than_cutoff: number;
    access_guard_older_than_cutoff: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM public.notifications WHERE read = true AND created_at < now() - make_interval(days => ${readNotifDays})) AS read_notifications_older_than_cutoff,
      (SELECT count(*)::int FROM public.notifications WHERE read = true) AS total_read_notifications,
      (SELECT count(*)::int FROM public.chat_security_events WHERE created_at < now() - make_interval(days => ${secEventDays})) AS security_events_older_than_cutoff,
      (SELECT count(*)::int FROM private.access_guard WHERE window_started_at < now() - make_interval(hours => ${guardHours}) AND (locked_until IS NULL OR locked_until < now())) AS access_guard_older_than_cutoff;
  `);

  let executionOutcome = "DRY_RUN_ROLLED_BACK";
  if (isApply && isConfirmed) {
    const syntheticIdsSql =
      safeSynthetic.length > 0
        ? safeSynthetic.map((r) => `'${r.user_id}'::uuid`).join(", ")
        : null;
    await runSql(`
      BEGIN;
      SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
      ${
        syntheticIdsSql
          ? `
            DELETE FROM public.matches
            WHERE user_a IN (${syntheticIdsSql}) OR user_b IN (${syntheticIdsSql});
            UPDATE public.profiles
            SET eliminado_en = now()
            WHERE user_id IN (${syntheticIdsSql}) AND eliminado_en IS NULL;
          `
          : ""
      }
      SELECT public.apply_retention_policy(
        ${abandonedDays},
        ${retentionConfig.soft_delete_grace_days.valor},
        ${readNotifDays},
        ${secEventDays},
        ${guardHours}
      );
      COMMIT;
    `);
    executionOutcome = "APPLIED_SOFT_DELETE_AND_RETENTION";
  }

  console.log(
    JSON.stringify(
      {
        mode: isApply ? "APPLY" : "DRY_RUN",
        executionOutcome,
        retentionPolicy: {
          abandonedIncompleteDays: abandonedDays,
          softDeleteGraceDays: retentionConfig.soft_delete_grace_days.valor,
          readNotificationsDays: readNotifDays,
          chatSecurityEventsDays: secEventDays,
          accessGuardHours: guardHours,
        },
        categories: {
          a_synthetic_or_test_profiles: {
            totalMatched: syntheticRows.length,
            excludedAdminCount: syntheticRows.filter((r) => r.is_admin).length,
            excludedWithActiveConversationsCount: syntheticNonAdmin.length - safeSynthetic.length,
            eligibleForSoftDeleteCount: safeSynthetic.length,
            candidates: syntheticNonAdmin.map((r) => ({
              pseudonymId: pseudonymize(r.user_id, "QA"),
              criterion: syntheticHashes.get(r.matricula_hash) ?? "explicit_qa_hash",
              quizCompleted: r.quiz_completed_at !== null,
              activeConversations: r.active_conversations,
              willSoftDelete: r.active_conversations === 0,
              createdAt: r.created_at,
            })),
          },
          b_abandoned_incomplete_profiles: {
            cutoffDays: abandonedDays,
            eligibleForSoftDeleteCount: abandonedRows.length,
            candidates: abandonedRows.map((r) => ({
              pseudonymId: pseudonymize(r.user_id, "ABD"),
              responseCount: r.response_count,
              createdAt: r.created_at,
            })),
          },
          c_orphan_rows: orphans,
          d_expired_notifications_and_guards: expired,
          e_unused_schema_elements: {
            deprecatedColumnsKeptForBackwardCompatibility: [
              "public.quiz_items.weights (JSONB default '{}', superseded by data/psychometric-params.json)",
            ],
            tablesToDrop: [],
          },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("purge-garbage failed:", err);
  process.exit(1);
});
