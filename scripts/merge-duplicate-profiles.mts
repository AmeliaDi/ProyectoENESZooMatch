/**
 * Transactional duplicate-profile merge & deduplication script (Fase 1).
 *
 * Defaults to `--dry-run` (runs inside `BEGIN ... ROLLBACK` and prints the
 * exact pseudonymous report of what would be merged/reassigned/soft-deleted).
 * Real execution requires `--execute --confirm` after explicit user approval.
 *
 * Privacy (Rule 3): never prints matrículas, `matricula_hash`, raw UUIDs,
 * quiz answers, or chat message contents.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectDuplicateGroups,
  planDuplicateMerge,
  selectSurvivor,
  type MergeCandidateProfile,
  type MergeMatchRow,
} from "../src/domain/identity/duplicate-merge.ts";

const args = new Set(process.argv.slice(2));
const isExecute = args.has("--execute") && args.has("--confirm");
const isDryRun = !isExecute;

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    // ignore missing file
  }
  return out;
}

const envLocal = loadEnvFile(resolve(process.cwd(), ".env.local"));
const envCli = loadEnvFile(resolve(process.cwd(), ".env.cli"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envLocal.NEXT_PUBLIC_SUPABASE_URL ?? envCli.NEXT_PUBLIC_SUPABASE_URL ?? "";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? envLocal.SUPABASE_ACCESS_TOKEN ?? envCli.SUPABASE_ACCESS_TOKEN ?? "";
const hmacSecret = process.env.MATRICULA_HMAC_SECRET ?? envLocal.MATRICULA_HMAC_SECRET ?? "dry-run-pseudonym-key";

const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] ?? "" : "";
if (!projectRef || !accessToken) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

async function runQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management SQL query failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T[];
}

function pseudonymOf(userId: string, indexMap: Map<string, string>): string {
  const normalized = userId.toLowerCase();
  const existing = indexMap.get(normalized);
  if (existing) return existing;
  const tag = createHmac("sha256", hmacSecret).update(`pseudo:${normalized}`).digest("hex").slice(0, 6).toUpperCase();
  const label = `P-${String(indexMap.size + 1).padStart(3, "0")}-${tag}`;
  indexMap.set(normalized, label);
  return label;
}

interface RawProfileRow {
  user_id: string;
  norm_hash: string;
  norm_alias: string | null;
  quiz_completed_at: string | null;
  completed_modules_count: number;
  answers_count: number;
  updated_at: string;
}

interface RawMatchRow {
  track: "romance" | "amistad";
  user_a: string;
  user_b: string;
  similarity: number;
}

async function main() {
  const pseudonyms = new Map<string, string>();

  const profiles = await runQuery<RawProfileRow>(`
    SELECT
      p.user_id::text AS user_id,
      lower(btrim(p.matricula_hash)) AS norm_hash,
      CASE WHEN p.alias IS NULL THEN NULL ELSE lower(btrim(p.alias)) END AS norm_alias,
      p.quiz_completed_at::text AS quiz_completed_at,
      COALESCE(cardinality(p.completed_modules), 0)::int AS completed_modules_count,
      (SELECT count(*)::int FROM public.quiz_responses r WHERE r.user_id = p.user_id) AS answers_count,
      p.updated_at::text AS updated_at
    FROM public.profiles p
    ORDER BY p.created_at ASC, p.user_id ASC;
  `);

  for (const p of profiles) pseudonymOf(p.user_id, pseudonyms);

  const matches = await runQuery<RawMatchRow>(`
    SELECT track, user_a::text AS user_a, user_b::text AS user_b, similarity::float8 AS similarity
    FROM public.matches
    ORDER BY track, user_a, user_b;
  `);

  const duplicateWelcomeUsers = await runQuery<{ user_id: string; welcome_count: number }>(`
    SELECT user_id::text AS user_id, count(*)::int AS welcome_count
    FROM public.notifications
    WHERE type = 'welcome'
    GROUP BY user_id
    HAVING count(*) > 1;
  `);

  const invertedOrDuplicateMatches = await runQuery<{ cnt: number }>(`
    SELECT count(*)::int AS cnt
    FROM (
      SELECT track, LEAST(user_a, user_b) AS a, GREATEST(user_a, user_b) AS b
      FROM public.matches
      GROUP BY track, LEAST(user_a, user_b), GREATEST(user_a, user_b)
      HAVING count(*) > 1
    ) sub;
  `);

  const candidatesByHash: MergeCandidateProfile[] = profiles.map((p) => ({
    userId: p.user_id,
    key: p.norm_hash,
    quizCompletedAt: p.quiz_completed_at,
    completedModulesCount: p.completed_modules_count,
    answersCount: p.answers_count,
    updatedAt: p.updated_at,
    eliminadoEn: null,
  }));

  const candidatesByAlias: MergeCandidateProfile[] = profiles
    .filter((p) => p.norm_alias !== null && p.norm_alias.length > 0)
    .map((p) => ({
      userId: p.user_id,
      key: p.norm_alias!,
      quizCompletedAt: p.quiz_completed_at,
      completedModulesCount: p.completed_modules_count,
      answersCount: p.answers_count,
      updatedAt: p.updated_at,
      eliminadoEn: null,
    }));

  const hashDuplicateGroups = detectDuplicateGroups(candidatesByHash);
  const aliasDuplicateGroups = detectDuplicateGroups(candidatesByAlias);

  const matchInputs: MergeMatchRow[] = matches.map((m) => ({
    track: m.track,
    userA: m.user_a,
    userB: m.user_b,
    similarity: m.similarity,
  }));

  const groupPlans = hashDuplicateGroups.map((group, idx) => {
    const { survivor, duplicates } = selectSurvivor(group.candidates);
    const plan = planDuplicateMerge(group, { matches: matchInputs });
    return {
      groupIndex: idx + 1,
      survivorPseudonym: pseudonymOf(survivor.userId, pseudonyms),
      survivorCompleted: survivor.quizCompletedAt !== null,
      survivorModules: survivor.completedModulesCount,
      survivorAnswers: survivor.answersCount,
      duplicatePseudonyms: duplicates.map((d) => ({
        pseudonym: pseudonymOf(d.userId, pseudonyms),
        completed: d.quizCompletedAt !== null,
        modules: d.completedModulesCount,
        answers: d.answersCount,
      })),
      reassignedMatchCount: plan.reassignedMatches.length,
      droppedSelfMatches: plan.droppedSelfMatches,
    };
  });

  const report = {
    mode: isDryRun ? "dry-run" : "execute",
    timestamp: new Date().toISOString(),
    totals: {
      activeProfilesScanned: profiles.length,
      completedProfiles: profiles.filter((p) => p.quiz_completed_at !== null).length,
      incompleteProfiles: profiles.filter((p) => p.quiz_completed_at === null).length,
      totalMatchesScanned: matches.length,
      duplicateMatriculaHashGroups: hashDuplicateGroups.length,
      duplicateAliasGroups: aliasDuplicateGroups.length,
      invertedOrDuplicateMatchPairs: invertedOrDuplicateMatches[0]?.cnt ?? 0,
      usersWithDuplicateWelcomeNotifications: duplicateWelcomeUsers.length,
    },
    survivorRule: [
      "1. quiz_completed_at IS NOT NULL (perfil con test terminado gana sobre incompleto)",
      "2. mayor cantidad de módulos opcionales completados (cardinality(completed_modules) DESC)",
      "3. mayor cantidad de respuestas guardadas en quiz_responses (COUNT(*) DESC)",
      "4. actualización más reciente (updated_at DESC, quiz_completed_at DESC)",
      "5. desempate determinista por user_id lexicográfico menor",
    ],
    groupsToMerge: groupPlans,
    duplicateWelcomePseudonyms: duplicateWelcomeUsers.map((u) => ({
      pseudonym: pseudonymOf(u.user_id, pseudonyms),
      welcomeCount: u.welcome_count,
    })),
    transactionalVerification: "pending" as "verified_rollback" | "committed" | "no_op",
  };

  if (hashDuplicateGroups.length > 0) {
    const statements: string[] = ["BEGIN;"];
    for (const group of hashDuplicateGroups) {
      const { survivor, duplicates } = selectSurvivor(group.candidates);
      const sId = survivor.userId;
      for (const dup of duplicates) {
        const dId = dup.userId;
        statements.push(`
          INSERT INTO public.quiz_responses (user_id, item_id, likert_value, selected_options, answered_at)
          SELECT '${sId}'::uuid, item_id, likert_value, selected_options, answered_at
          FROM public.quiz_responses WHERE user_id = '${dId}'::uuid
          ON CONFLICT (user_id, item_id) DO NOTHING;

          DELETE FROM public.matches
          WHERE (user_a = LEAST('${sId}'::uuid, '${dId}'::uuid) AND user_b = GREATEST('${sId}'::uuid, '${dId}'::uuid));

          INSERT INTO public.matches (track, user_a, user_b, similarity, badges, computed_at)
          SELECT
            track,
            LEAST('${sId}'::uuid, CASE WHEN user_a = '${dId}'::uuid THEN user_b ELSE user_a END),
            GREATEST('${sId}'::uuid, CASE WHEN user_a = '${dId}'::uuid THEN user_b ELSE user_a END),
            similarity,
            badges,
            computed_at
          FROM public.matches
          WHERE (user_a = '${dId}'::uuid OR user_b = '${dId}'::uuid)
            AND user_a <> '${sId}'::uuid AND user_b <> '${sId}'::uuid
          ON CONFLICT (user_a, user_b, track) DO UPDATE
            SET similarity = GREATEST(public.matches.similarity, EXCLUDED.similarity);

          DELETE FROM public.matches WHERE user_a = '${dId}'::uuid OR user_b = '${dId}'::uuid;

          UPDATE public.notifications SET user_id = '${sId}'::uuid
          WHERE user_id = '${dId}'::uuid
            AND NOT (type = 'welcome' AND EXISTS (
              SELECT 1 FROM public.notifications n2 WHERE n2.user_id = '${sId}'::uuid AND n2.type = 'welcome'
            ));

          DELETE FROM public.chat_interests
          WHERE (from_user = '${sId}'::uuid AND to_user = '${dId}'::uuid)
             OR (from_user = '${dId}'::uuid AND to_user = '${sId}'::uuid);

          INSERT INTO public.chat_interests (from_user, to_user, track, created_at)
          SELECT '${sId}'::uuid, to_user, track, created_at
          FROM public.chat_interests WHERE from_user = '${dId}'::uuid AND to_user <> '${sId}'::uuid
          ON CONFLICT (from_user, to_user, track) DO NOTHING;

          INSERT INTO public.chat_interests (from_user, to_user, track, created_at)
          SELECT from_user, '${sId}'::uuid, track, created_at
          FROM public.chat_interests WHERE to_user = '${dId}'::uuid AND from_user <> '${sId}'::uuid
          ON CONFLICT (from_user, to_user, track) DO NOTHING;

          DELETE FROM public.chat_interests WHERE from_user = '${dId}'::uuid OR to_user = '${dId}'::uuid;

          UPDATE public.profiles
          SET paused_at = COALESCE(paused_at, now())
          WHERE user_id = '${dId}'::uuid;
        `);
      }
    }
    statements.push(isDryRun ? "ROLLBACK;" : "COMMIT;");
    await runQuery(statements.join("\n"));
    report.transactionalVerification = isDryRun ? "verified_rollback" : "committed";
  } else {
    await runQuery("BEGIN; SELECT 1; ROLLBACK;");
    report.transactionalVerification = isDryRun ? "verified_rollback" : "no_op";
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
