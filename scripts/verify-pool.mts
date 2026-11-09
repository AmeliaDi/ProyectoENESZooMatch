/**
 * Fase 5 — Verificación de pool y constelación (sólo lectura).
 *
 * Comprueba que toda persona eclosionada + activa + con quiz completo entra al
 * pool de matching, reporta la distribución de 0-matches por causa, y simula
 * independencia de orden con permutaciones aleatorias sobre datos sintéticos.
 *
 * Uso:
 *   node --no-warnings scripts/verify-pool.mts            (dry-run, sólo lectura)
 *   node --no-warnings scripts/verify-pool.mts --simulate (añade simulación local)
 *
 * Privacidad: sólo conteos y causas agregadas. Cero ids, matrículas ni respuestas.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const envLocal = loadEnvFile(resolve(ROOT, ".env.local"));
const envCli = loadEnvFile(resolve(ROOT, ".env.cli"));
const pick = (key: string): string | undefined => process.env[key] ?? envCli[key] ?? envLocal[key];

const SUPABASE_URL = pick("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const PROJECT_REF =
  pick("SUPABASE_PROJECT_REF") ?? (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split(".")[0] : undefined) ?? "";
const ACCESS_TOKEN = pick("SUPABASE_ACCESS_TOKEN") ?? "";

const HAS_CREDS = Boolean(PROJECT_REF && ACCESS_TOKEN);
if (!HAS_CREDS && !process.argv.includes("--simulate")) {
  console.error("verify-pool: faltan credenciales. Usa --simulate para sólo la simulación local.");
  process.exit(2);
}

async function runSql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return Array.isArray(body) ? (body as T[]) : [];
}

// ─── 1. Pool inclusion ──────────────────────────────────────────────────────

if (HAS_CREDS) {
try {
console.log("═══ Verificación de pool (sólo lectura) ═══\n");

const [poolStats] = await runSql<{
  total_hatched: number;
  in_pool: number;
  missing_quiz: number;
  paused: number;
  deleted: number;
}>(`
  SELECT
    count(*) FILTER (WHERE estado_identidad = 'eclosionado') AS total_hatched,
    count(*) FILTER (WHERE estado_identidad = 'eclosionado'
      AND quiz_completed_at IS NOT NULL
      AND paused_at IS NULL
      AND eliminado_en IS NULL) AS in_pool,
    count(*) FILTER (WHERE estado_identidad = 'eclosionado'
      AND quiz_completed_at IS NULL) AS missing_quiz,
    count(*) FILTER (WHERE estado_identidad = 'eclosionado'
      AND paused_at IS NOT NULL) AS paused,
    count(*) FILTER (WHERE estado_identidad = 'eclosionado'
      AND eliminado_en IS NOT NULL) AS deleted
  FROM profiles
`);

console.log("Personas eclosionadas:", poolStats?.total_hatched ?? "?");
console.log("En pool (activas + quiz completo):", poolStats?.in_pool ?? "?");
console.log("Excluidas — sin quiz_completed_at:", poolStats?.missing_quiz ?? 0);
console.log("Excluidas — pausadas:", poolStats?.paused ?? 0);
console.log("Excluidas — eliminadas:", poolStats?.deleted ?? 0);

const excluded = (poolStats?.missing_quiz ?? 0) + (poolStats?.paused ?? 0);
if (excluded === 0) {
  console.log("\n✓ Toda persona eclosionada activa está en el pool.");
  if ((poolStats?.deleted ?? 0) > 0) {
    console.log(`  (${poolStats?.deleted} cuentas eliminadas — exclusión esperada)`);
  }
} else {
  console.log(`\n⚠ ${excluded} eclosionadas activas fuera del pool (revisar causas arriba).`);
}

// ─── 2. Zero-match distribution ─────────────────────────────────────────────

console.log("\n═══ Distribución de 0-matches ═══\n");

const zeroMatch = await runSql<{ track: string; zero_count: number; total: number }>(`
  WITH pool AS (
    SELECT user_id FROM profiles
    WHERE estado_identidad = 'eclosionado'
      AND quiz_completed_at IS NOT NULL
      AND paused_at IS NULL AND eliminado_en IS NULL
  ),
  romance_counts AS (
    SELECT p.user_id,
      (SELECT count(*) FROM matches m
       WHERE m.track = 'romance' AND (m.user_a = p.user_id OR m.user_b = p.user_id)) AS cnt
    FROM pool p
  ),
  amistad_counts AS (
    SELECT p.user_id,
      (SELECT count(*) FROM matches m
       WHERE m.track = 'amistad' AND (m.user_a = p.user_id OR m.user_b = p.user_id)) AS cnt
    FROM pool p
  )
  SELECT 'romance' AS track,
    count(*) FILTER (WHERE cnt = 0) AS zero_count,
    count(*) AS total
  FROM romance_counts
  UNION ALL
  SELECT 'amistad' AS track,
    count(*) FILTER (WHERE cnt = 0) AS zero_count,
    count(*) AS total
  FROM amistad_counts
`);

for (const row of zeroMatch) {
  console.log(`${row.track}: ${row.zero_count}/${row.total} con 0 matches (${((100 * row.zero_count) / row.total).toFixed(1)} %)`);
}

const hardFilterReasons = await runSql<{ reason: string; cnt: number }>(`
  SELECT
    CASE
      WHEN tipo_relacion_busca @> ARRAY['solo_amistad'] THEN 'solo_amistad'
      WHEN orientacion_sexual @> ARRAY['prefiero_no_decir'] THEN 'prefiero_no_decir'
      WHEN identidad_genero @> ARRAY['prefiero_no_decir'] THEN 'genero_no_decir'
      ELSE 'otro / umbral'
    END AS reason,
    count(*) AS cnt
  FROM profiles
  WHERE estado_identidad = 'eclosionado'
    AND quiz_completed_at IS NOT NULL
    AND paused_at IS NULL AND eliminado_en IS NULL
    AND user_id NOT IN (
      SELECT user_a FROM matches WHERE track = 'romance'
      UNION SELECT user_b FROM matches WHERE track = 'romance'
    )
  GROUP BY 1 ORDER BY cnt DESC
`);

console.log("\nCausas de 0 romance (filtros duros / umbral):");
for (const row of hardFilterReasons) {
  console.log(`  ${row.reason}: ${row.cnt}`);
}
} catch (e) {
  console.warn("⚠ Consultas de producción fallaron (¿token expirado?):", (e as Error).message);
}
} else {
  console.log("(sin credenciales — omitiendo consultas de producción)\n");
}

// ─── 3. Order-independence simulation ───────────────────────────────────────

if (process.argv.includes("--simulate")) {
  console.log("\n═══ Simulación de independencia de orden ═══\n");

  const viteOpts = { configFile: false as const, root: ROOT, resolve: { alias: { "@": `${ROOT}/src` } }, logLevel: "error" as const };
  const matchingMod = (await runnerImport("@/domain/matching", viteOpts)).module as {
    computeAllMatches: (pool: unknown[], config: unknown) => unknown[];
    MATCHING_CONFIG: unknown;
  };
  const fixturesMod = (await runnerImport("@/domain/matching/test-fixtures", viteOpts)).module as {
    flatLatent: (theta: Record<string, number>, se: number) => unknown;
    hardFilters: (overrides?: Record<string, unknown>) => unknown;
    makeProfile: (latent: unknown, filters?: unknown) => unknown;
  };
  const { computeAllMatches, MATCHING_CONFIG } = matchingMod;
  const { flatLatent, hardFilters, makeProfile } = fixturesMod;

  const syntheticPool = Array.from({ length: 20 }, (_, i) => ({
    userId: `synthetic-${String(i).padStart(3, "0")}`,
    profile: makeProfile(
      flatLatent({ [String(i % 8)]: 0.3 + (i % 5) * 0.1 }, 0.2),
      hardFilters(i % 7 === 0 ? { tipo_relacion_busca: ["solo_amistad"] } : {}),
    ),
  }));

  const baseline = computeAllMatches(syntheticPool, MATCHING_CONFIG);
  let failures = 0;
  const RUNS = 50;

  for (let run = 0; run < RUNS; run++) {
    const shuffled = [...syntheticPool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const result = computeAllMatches(shuffled, MATCHING_CONFIG);
    if (JSON.stringify(result) !== JSON.stringify(baseline)) {
      failures++;
      console.error(`✗ Permutación ${run} produjo resultado distinto.`);
    }
  }

  if (failures === 0) {
    console.log(`✓ ${RUNS} permutaciones aleatorias → mismo resultado (${baseline.length} pares).`);
  } else {
    console.error(`✗ ${failures}/${RUNS} permutaciones fallaron.`);
    process.exit(1);
  }
}

console.log("\n═══ Verificación completa ═══");