/**
 * Fase 6 — Congelación de la identidad canónica en producción.
 *
 * Escribe UNA vez la identidad de cada persona (`huevo` → `eclosionado`) con el
 * mismo cálculo puro que usa la app (`hatchIdentity`), y devuelve a huevo a
 * quien no tiene el núcleo obligatorio completo. No renombra a nadie cuyo
 * `eclosionado_en` ya esté escrito: esa regla es la que hace el script
 * re-ejecutable y la que deja el paso 2 (`identity_drop_legacy.sql`) seguro.
 *
 * Modos:
 *   node --no-warnings scripts/identity-backfill.mts --check   (sólo lectura; exit 1 si falta trabajo)
 *   node --no-warnings scripts/identity-backfill.mts           (dry-run: BEGIN … ROLLBACK)
 *   node --no-warnings scripts/identity-backfill.mts --apply --confirm
 *
 * Privacidad: nunca imprime matrículas, `matricula_hash`, respuestas, vectores
 * ni θ; las personas se reportan con seudónimo determinista `P-###-TAG`, donde
 * el TAG es `HMAC(secreto, "pseudo:"+user_id)` y sobrevive a reordenamientos.
 */

import { createHmac } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

import type { LatentProfile } from "../src/types/latent.ts";
import type { DimensionScores, QuizItem } from "../src/types/microtest.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ─── Modo ────────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const CHECK_ONLY = argv.has("--check");
const APPLY = argv.has("--apply");
if (APPLY && !argv.has("--confirm")) {
  console.error("identity-backfill: --apply requiere --confirm (y un respaldo verificado antes).");
  process.exit(2);
}
if (CHECK_ONLY && APPLY) {
  console.error("identity-backfill: --check y --apply son excluyentes.");
  process.exit(2);
}
const WRITE = !CHECK_ONLY;
const COMMIT = APPLY;

// ─── Conexión (Management API, sin JWT de service_role) ──────────────────────

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

const envLocal = loadEnvFile(resolve(process.cwd(), ".env.local"));
const envCli = loadEnvFile(resolve(process.cwd(), ".env.cli"));
const pick = (key: string): string | undefined => process.env[key] ?? envCli[key] ?? envLocal[key];

const SUPABASE_URL = pick("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const PROJECT_REF =
  pick("SUPABASE_PROJECT_REF") ?? (SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split(".")[0] : undefined) ?? "";
const ACCESS_TOKEN = pick("SUPABASE_ACCESS_TOKEN") ?? "";
const HMAC_SECRET = pick("MATRICULA_HMAC_SECRET") ?? "";

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("identity-backfill: faltan NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_PROJECT_REF) y SUPABASE_ACCESS_TOKEN.");
  process.exit(2);
}
// El sufijo y los empates se siembran con este secreto; sin él el alias calculado
// aquí no coincidiría con el que calcula el servidor y el backfill sería falso.
if (!HMAC_SECRET) {
  console.error("identity-backfill: falta MATRICULA_HMAC_SECRET; es la única semilla del sufijo.");
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

// ─── Reporte seudónimo ───────────────────────────────────────────────────────

const pseudonyms = new Map<string, string>();

function pseudonymOf(userId: string): string {
  const normalized = userId.trim().toLowerCase();
  const known = pseudonyms.get(normalized);
  if (known) return known;
  const tag = createHmac("sha256", HMAC_SECRET)
    .update(`pseudo:${normalized}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const label = `P-${String(pseudonyms.size + 1).padStart(3, "0")}-${tag}`;
  pseudonyms.set(normalized, label);
  return label;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sqlUuid(userId: string): string {
  if (!UUID_PATTERN.test(userId)) throw new Error(`user_id fuera de formato UUID: ${userId}`);
  return `'${userId.toLowerCase()}'::uuid`;
}

/** La única forma de meter texto en el SQL: comilla doblada y sin caracteres raros. */
function sqlText(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

// ─── Datos ───────────────────────────────────────────────────────────────────

interface ProfileRow {
  user_id: string;
  estado_identidad: "huevo" | "eclosionado";
  eclosionado_en: string | null;
  quiz_completed_at: string | null;
  animal_id: string | null;
  color_id: string | null;
  alias: string | null;
  alias_completo: string | null;
  alias_animal: string | null;
  alias_color: string | null;
  alias_sufijo: string | null;
  enneagram_code: string | null;
  mbti_code: string | null;
  avatar_mark: string | null;
  revelacion_vista: boolean;
  latent_profile: LatentProfile | null;
  dimension_scores: DimensionScores | null;
  answered_items: string[] | null;
}

interface HatchResultLike {
  animalId: string;
  colorId: string;
  aliasAnimal: string;
  aliasColor: string;
  aliasSufijo: string;
  aliasCompleto: string;
  enneagram: { type: number | null; wing: number | null };
  narrative: string;
  mark: string | null;
}

function shannonEntropy(counts: Iterable<number>, total: number): number {
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log(p);
    }
  }
  return h;
}

/** Compara dos distribuciones por id: máximos, entropías y el peso de un color. */
function distributionStats(counts: Map<string, number>, total: number, focal: string) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 3).map(([id, count]) => ({
    id,
    count,
    pct: Number(((count / Math.max(total, 1)) * 100).toFixed(2)),
  }));
  return {
    entropyNats: Number(shannonEntropy(counts.values(), total).toFixed(4)),
    distinctIds: sorted.filter(([, count]) => count > 0).length,
    maxShare: top[0] ?? null,
    focalShare: Number((((counts.get(focal) ?? 0) / Math.max(total, 1)) * 100).toFixed(2)),
    top,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const hatchModule = (
    await runnerImport("@/domain/identity/hatch-identity", {
      configFile: false,
      root: ROOT,
      resolve: { alias: { "@": `${ROOT}/src` } },
      logLevel: "error",
    })
  ).module as {
    hatchIdentity: (
      input: { userId: string; latent: LatentProfile; normalizedScores?: DimensionScores | undefined },
      secret: string,
      catalog: unknown,
      options: { existingAliases: ReadonlySet<string> },
    ) => HatchResultLike;
    enneagramCodeOf: (readout: HatchResultLike["enneagram"]) => string | null;
    isValidAliasCompleto: (alias: string, animal: string, color: string, suffix: string) => boolean;
  };
  const configModule = (
    await runnerImport("@/config", {
      configFile: false,
      root: ROOT,
      resolve: { alias: { "@": `${ROOT}/src` } },
      logLevel: "error",
    })
  ).module as {
    CATALOG: unknown;
    AVATAR_CONFIG: {
      identity: {
        suffix_alphabet: { valor: string };
        suffix_length: { valor: number };
        separator: { valor: string };
        blocked_suffixes: { valor: string[] };
        max_collision_attempts: { valor: number };
      };
    };
  };
  const conditionModule = (
    await runnerImport("@/domain/identity/hatch-condition", {
      configFile: false,
      root: ROOT,
      resolve: { alias: { "@": `${ROOT}/src` } },
      logLevel: "error",
    })
  ).module as {
    hatchConditionMet: (items: readonly QuizItem[], answered: ReadonlySet<string>) => boolean;
    identityRequirements: (
      items: readonly QuizItem[],
      answered: ReadonlySet<string>,
    ) => { answeredRequired: number; totalRequired: number };
  };
  const itemsModule = (
    await runnerImport("@/domain/matching", {
      configFile: false,
      root: ROOT,
      resolve: { alias: { "@": `${ROOT}/src` } },
      logLevel: "error",
    })
  ).module as { MICROTEST_ITEMS: readonly QuizItem[] };
  const copyModule = (
    await runnerImport("@/domain/messages/notification-copy", {
      configFile: false,
      root: ROOT,
      resolve: { alias: { "@": `${ROOT}/src` } },
      logLevel: "error",
    })
  ).module as { nameFrozenMessage: (name: string) => { title: string; body: string } };

  const identityConfig = configModule.AVATAR_CONFIG.identity;
  const separator = identityConfig.separator.valor;
  const suffixSpace = identityConfig.suffix_alphabet.valor.length ** identityConfig.suffix_length.valor;
  const usableSuffixes = suffixSpace - new Set(identityConfig.blocked_suffixes.valor).size;

  // 0. El paso 1 tiene que estar aplicado: sin columnas ni tipo `identity` no
  //    hay nada que congelar, y escribir a ciegas sería peor que no escribir.
  const columns = new Set(
    (
      await runSql<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles';`,
      )
    ).map((row) => row.column_name),
  );
  for (const needed of ["estado_identidad", "alias_completo", "alias_sufijo", "eclosionado_en", "enneagram_code"]) {
    if (!columns.has(needed)) {
      throw new Error(`falta la columna ${needed}: aplica antes 20261114000000_identity_single_source.sql`);
    }
  }
  const typeConstraint = await runSql<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check';`,
  );
  if (!typeConstraint[0]?.def.includes("'identity'")) {
    throw new Error("el CHECK de notifications.type aún no admite 'identity': aplica antes el paso 1");
  }
  // El paso 2 borra `alias`. Leerla de forma condicional deja el script
  // re-ejecutable después de la limpieza, que es cuando conviene verificar.
  const hasLegacyAlias = columns.has("alias");
  const aliasColumn = hasLegacyAlias ? "p.alias" : "NULL::text AS alias";
  /** Mientras el paso 2 no corra, la columna heredada sigue existiendo y hay que escribirla. */
  const legacyAliasSet = (value: string | null): string =>
    hasLegacyAlias ? `alias = ${sqlText(value)},` : "";

  // 1. Estado actual, orden estable para que el seudónimo P-### sea reproducible.
  const rows = await runSql<ProfileRow>(`
    SELECT
      p.user_id::text,
      p.estado_identidad,
      p.eclosionado_en::text,
      p.quiz_completed_at::text,
      p.animal_id,
      p.color_id,
      ${aliasColumn},
      p.alias_completo,
      p.alias_animal,
      p.alias_color,
      p.alias_sufijo,
      p.enneagram_code,
      p.mbti_code,
      p.avatar_mark,
      p.revelacion_vista,
      p.latent_profile,
      p.dimension_scores,
      COALESCE((
        SELECT array_agg(DISTINCT r.item_id ORDER BY r.item_id)
        FROM public.quiz_responses AS r
        WHERE r.user_id = p.user_id AND r.likert_value IS NOT NULL
      ), '{}') AS answered_items
    FROM public.profiles AS p
    WHERE p.eliminado_en IS NULL
    ORDER BY p.created_at ASC, p.user_id ASC;
  `);

  const taken = new Set<string>();
  for (const row of rows) if (row.alias_completo) taken.add(row.alias_completo);

  const colorRows = await runSql<{ id: string; nombre: string }>(
    `SELECT id, nombre FROM public.colors ORDER BY id;`,
  );
  const beforeColors = new Map<string, number>();
  for (const color of colorRows) beforeColors.set(color.id, 0);

  let frozenUntouched = 0;
  let eggsClean = 0;
  let onlyFreeze = 0;
  const hatchPlan: Array<{ row: ProfileRow; hatch: HatchResultLike; enneagramCode: string | null; renamed: boolean }> = [];
  const eggPlan: ProfileRow[] = [];
  const failedAllocation: Array<{ pseudonym: string; message: string }> = [];
  const missingLatent: string[] = [];

  for (const row of rows) {
    if (row.estado_identidad === "eclosionado" && row.color_id) {
      beforeColors.set(row.color_id, (beforeColors.get(row.color_id) ?? 0) + 1);
    }

    // `eclosionado_en IS NOT NULL` = identidad canónica escrita y cerrada. La
    // regla de oro prohuebe recalcularla, así que estas filas no se tocan.
    if (row.eclosionado_en !== null) {
      frozenUntouched += 1;
      continue;
    }

    const answered = new Set(row.answered_items ?? []);
    if (!conditionModule.hatchConditionMet(itemsModule.MICROTEST_ITEMS, answered)) {
      // Núcleo incompleto: huevo. Si ya lo era del todo, no se toca.
      const dirty =
        row.estado_identidad !== "huevo" ||
        row.animal_id !== null ||
        row.color_id !== null ||
        row.alias !== null ||
        row.alias_completo !== null ||
        row.alias_animal !== null ||
        row.alias_color !== null ||
        row.alias_sufijo !== null ||
        row.enneagram_code !== null ||
        row.avatar_mark !== null ||
        row.revelacion_vista;
      if (dirty) eggPlan.push(row);
      else eggsClean += 1;
      continue;
    }

    if (!row.latent_profile) {
      missingLatent.push(pseudonymOf(row.user_id));
      continue;
    }
    try {
      const hatch = hatchModule.hatchIdentity(
        { userId: row.user_id, latent: row.latent_profile, normalizedScores: row.dimension_scores ?? undefined },
        HMAC_SECRET,
        configModule.CATALOG,
        { existingAliases: taken },
      );
      if (!hatchModule.isValidAliasCompleto(hatch.aliasCompleto, hatch.aliasAnimal, hatch.aliasColor, hatch.aliasSufijo)) {
        throw new Error(`alias calculada fuera de formato: ${hatch.aliasCompleto}`);
      }
      taken.add(hatch.aliasCompleto);
      const enneagramCode = hatchModule.enneagramCodeOf(hatch.enneagram);
      const canonical =
        row.estado_identidad === "eclosionado" &&
        row.animal_id === hatch.animalId &&
        row.color_id === hatch.colorId &&
        row.alias_completo === hatch.aliasCompleto &&
        (!hasLegacyAlias || row.alias === hatch.aliasCompleto) &&
        row.alias_animal === hatch.aliasAnimal &&
        row.alias_color === hatch.aliasColor &&
        row.alias_sufijo === hatch.aliasSufijo &&
        row.enneagram_code === enneagramCode;
      if (canonical) onlyFreeze += 1;
      hatchPlan.push({ row, hatch, enneagramCode, renamed: row.alias_completo !== hatch.aliasCompleto });
    } catch (error) {
      // Sin sufijo libre no se escribe nada: el reporte lo dice y la siguiente
      // ejecución vuelve a empezar desde cero.
      failedAllocation.push({
        pseudonym: pseudonymOf(row.user_id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failedAllocation.length > 0) {
    throw new Error(
      `no se pudo asignar sufijo a ${failedAllocation.length} perfil(es) en ${identityConfig.max_collision_attempts.valor} intentos: ${failedAllocation
        .map((f) => `${f.pseudonym} (${f.message})`)
        .join("; ")} — nada se escribió.`,
    );
  }
  if (missingLatent.length > 0) {
    throw new Error(
      `${missingLatent.length} perfil(es) con núcleo completo pero sin latent_profile (${missingLatent.slice(0, 5).join(", ")}): nada se escribió.`,
    );
  }

  // 2. Distribución esperada después del plan. El dry-run hace ROLLBACK, así
  //    que se calcula aquí en vez de leerla de la BD.
  const afterColors = new Map<string, number>();
  for (const id of beforeColors.keys()) afterColors.set(id, 0);
  const plannedColor = new Map(hatchPlan.map((item) => [item.row.user_id.toLowerCase(), item.hatch.colorId]));
  const isFrozen = (row: ProfileRow): boolean => row.eclosionado_en !== null;
  const wasHatched = (row: ProfileRow): boolean => row.estado_identidad === "eclosionado";
  for (const row of rows) {
    const outcome =
      (isFrozen(row) && wasHatched(row) ? row.color_id : null) ?? plannedColor.get(row.user_id.toLowerCase()) ?? null;
    if (outcome) afterColors.set(outcome, (afterColors.get(outcome) ?? 0) + 1);
  }
  const beforeHatched = rows.filter(wasHatched).length;
  const afterHatched = rows.filter((row) => (isFrozen(row) && wasHatched(row)) || plannedColor.has(row.user_id.toLowerCase())).length;
  const focal = "ennea-neblina";
  const distribution = {
    hatchedBefore: beforeHatched,
    hatchedAfter: afterHatched,
    before: distributionStats(beforeColors, beforeHatched, focal),
    after: distributionStats(afterColors, afterHatched, focal),
  };

  // 3. Sentencias.
  const statements: string[] = [];
  for (const item of hatchPlan) {
    const { row, hatch, enneagramCode, renamed } = item;
    // `revelacion_vista`: quien estrena nombre ve la ficha una vez; a quien ya
    // tenía este mismo nombre congelado se le respeta el valor actual.
    const reveal = renamed ? false : row.revelacion_vista;
    statements.push(`
      UPDATE public.profiles SET
        estado_identidad = 'eclosionado',
        animal_id = ${sqlText(hatch.animalId)},
        color_id = ${sqlText(hatch.colorId)},
        ${legacyAliasSet(hatch.aliasCompleto)}
        alias_animal = ${sqlText(hatch.aliasAnimal)},
        alias_color = ${sqlText(hatch.aliasColor)},
        alias_sufijo = ${sqlText(hatch.aliasSufijo)},
        alias_completo = ${sqlText(hatch.aliasCompleto)},
        enneagram_code = ${sqlText(enneagramCode)},
        narrative = ${sqlText(hatch.narrative)},
        avatar_mark = ${sqlText(hatch.mark)},
        color_asignado_en = COALESCE(color_asignado_en, now()),
        eclosionado_en = now(),
        revelacion_vista = ${reveal ? "true" : "false"}
      WHERE user_id = ${sqlUuid(row.user_id)} AND eclosionado_en IS NULL;
    `);
    if (renamed) {
      const copy = copyModule.nameFrozenMessage(hatch.aliasCompleto);
      statements.push(`
        INSERT INTO public.notifications (user_id, type, title, body, metadata)
        VALUES (
          ${sqlUuid(row.user_id)},
          'identity',
          ${sqlText(copy.title)},
          ${sqlText(copy.body)},
          '{"origen":"fase6-backfill"}'::jsonb
        )
        ON CONFLICT (user_id) WHERE type = 'identity' DO NOTHING;
      `);
    }
  }
  for (const row of eggPlan) {
    const id = sqlUuid(row.user_id);
    statements.push(`
      UPDATE public.profiles SET
        estado_identidad = 'huevo',
        animal_id = NULL,
        color_id = NULL,
        ${legacyAliasSet(null)}
        alias_animal = NULL,
        alias_color = NULL,
        alias_sufijo = NULL,
        alias_completo = NULL,
        enneagram_code = NULL,
        avatar_mark = NULL,
        narrative = NULL,
        color_asignado_en = NULL,
        eclosionado_en = NULL,
        revelacion_vista = false
      WHERE user_id = ${id} AND eclosionado_en IS NULL;

      DELETE FROM public.matches WHERE user_a = ${id} OR user_b = ${id};

      DELETE FROM public.notifications
      WHERE user_id = ${id} AND type IN ('match_romance', 'match_amistad', 'no_match');
    `);
  }

  // 4. Invariantes dentro de la misma transacción: si alguna se rompe, todo
  //    hace rollback y el reporte dice cuál. Solo miran perfiles vivos: los
  //    borrados en suave los limpia el script de retención, no este.
  const assertions = `
    DO ${"$"}${"$"}
    DECLARE
      v_provisional INTEGER;
      v_huevo_sucio INTEGER;
      v_alias_duplicadas INTEGER;
      v_alias_desincronizadas INTEGER;
      v_partes_incoherentes INTEGER;
      v_huerfanos INTEGER;
      v_pares_duplicados INTEGER;
    BEGIN
      SELECT count(*) INTO v_provisional FROM public.profiles
       WHERE eliminado_en IS NULL AND estado_identidad = 'eclosionado' AND eclosionado_en IS NULL;
      IF v_provisional > 0 THEN
        RAISE EXCEPTION 'invariante rota: % perfiles eclosionados sin congelar', v_provisional USING ERRCODE = 'P0001';
      END IF;

      SELECT count(*) INTO v_huevo_sucio FROM public.profiles
       WHERE eliminado_en IS NULL AND estado_identidad = 'huevo'
         AND (animal_id, color_id, alias, alias_completo, alias_animal, alias_color, alias_sufijo, enneagram_code, eclosionado_en)
             IS DISTINCT FROM (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
      IF v_huevo_sucio > 0 THEN
        RAISE EXCEPTION 'invariante rota: % huevos conservan datos de identidad', v_huevo_sucio USING ERRCODE = 'P0001';
      END IF;

      SELECT count(*) INTO v_alias_duplicadas FROM (
        SELECT alias_completo FROM public.profiles
         WHERE eliminado_en IS NULL AND alias_completo IS NOT NULL GROUP BY alias_completo HAVING count(*) > 1
      ) AS d;
      IF v_alias_duplicadas > 0 THEN
        RAISE EXCEPTION 'invariante rota: % alias repetidas', v_alias_duplicadas USING ERRCODE = 'P0001';
      END IF;

      ${
        hasLegacyAlias
          ? `SELECT count(*) INTO v_alias_desincronizadas FROM public.profiles
       WHERE eliminado_en IS NULL AND alias_completo IS NOT NULL AND alias IS DISTINCT FROM alias_completo;
      IF v_alias_desincronizadas > 0 THEN
        RAISE EXCEPTION 'invariante rota: % alias heredadas sin sincronizar (el paso 2 se rechazaría)', v_alias_desincronizadas USING ERRCODE = 'P0001';
      END IF;`
          : "-- columna heredada `alias` ya eliminada: nada que sincronizar"
      }

      SELECT count(*) INTO v_partes_incoherentes FROM public.profiles
       WHERE eliminado_en IS NULL AND eclosionado_en IS NOT NULL
         AND alias_completo IS DISTINCT FROM alias_animal || ' ' || alias_color || ${sqlText(separator)} || alias_sufijo;
      IF v_partes_incoherentes > 0 THEN
        RAISE EXCEPTION 'invariante rota: % alias no coinciden con sus partes', v_partes_incoherentes USING ERRCODE = 'P0001';
      END IF;

      SELECT count(*) INTO v_huerfanos FROM public.matches AS m
       JOIN public.profiles AS pa ON pa.user_id = m.user_a
       JOIN public.profiles AS pb ON pb.user_id = m.user_b
       WHERE pa.eliminado_en IS NULL AND pb.eliminado_en IS NULL
         AND (pa.estado_identidad = 'huevo' OR pb.estado_identidad = 'huevo');
      IF v_huerfanos > 0 THEN
        RAISE EXCEPTION 'invariante rota: % pares con un lado en huevo', v_huerfanos USING ERRCODE = 'P0001';
      END IF;

      SELECT count(*) INTO v_pares_duplicados FROM (
        SELECT user_a, user_b, track FROM public.matches
         GROUP BY user_a, user_b, track HAVING count(*) > 1
      ) AS d;
      IF v_pares_duplicados > 0 THEN
        RAISE EXCEPTION 'invariante rota: % pares duplicados', v_pares_duplicados USING ERRCODE = 'P0001';
      END IF;
    END;
    ${"$"}${"$"};
  `;

  if (WRITE) {
    if (statements.length === 0) {
      await runSql("BEGIN; SELECT 1; ROLLBACK;");
    } else {
      await runSql(["BEGIN;", ...statements, assertions, COMMIT ? "COMMIT;" : "ROLLBACK;"].join("\n"));
    }
  }

  const changed = hatchPlan.filter((item) => item.renamed).map((item) => ({
    pseudonym: pseudonymOf(item.row.user_id),
    from: item.row.alias_completo ?? item.row.alias,
    to: item.hatch.aliasCompleto,
  }));
  const report = {
    mode: CHECK_ONLY ? "CHECK" : COMMIT ? "APPLIED" : "DRY_RUN_ROLLBACK",
    rows: {
      total: rows.length,
      frozenUntouched,
      toHatch: hatchPlan.length,
      onlyFreeze,
      toEgg: eggPlan.length,
      eggsClean,
      nameChanged: changed.length,
      noticesQueued: changed.length,
    },
    capacity: {
      suffixSpace,
      usableSuffixes,
      aliasesInUse: taken.size,
      saturationPct: Number(((taken.size / usableSuffixes) * 100).toFixed(3)),
    },
    distribution,
    pending: [...hatchPlan, ...eggPlan].length,
    pseudonyms: changed,
    eggs: eggPlan.map((row) => pseudonymOf(row.user_id)),
  };
  console.log(JSON.stringify(report, null, 2));

  if (COMMIT && changed.length > 0) {
    appendChangelog(report);
  }
  if (CHECK_ONLY && report.pending > 0) process.exitCode = 1;
}

function appendChangelog(report: {
  mode: string;
  rows: Record<string, number>;
  pseudonyms: Array<{ pseudonym: string; from: string | null; to: string }>;
  eggs: string[];
}): void {
  const path = resolve(ROOT, "docs/CHANGELOG_IDENTIDAD.md");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    "",
    `## ${stamp} — identity-backfill (${report.mode})`,
    "",
    `- Eclosionadas: ${report.rows.toHatch} · nombre corregido: ${report.rows.nameChanged} · devueltas a huevo: ${report.rows.toEgg} · ya congeladas intocadas: ${report.rows.frozenUntouched}`,
    "",
    "| seudónimo | alias antes | alias después |",
    "| --- | --- | --- |",
    ...report.pseudonyms.map((c) => `| ${c.pseudonym} | ${c.from ?? "—"} | ${c.to} |`),
    "",
    ...(report.eggs.length > 0 ? [`Huevos (respuestas parciales conservadas): ${report.eggs.join(", ")}`, ""] : []),
  ];
  appendFileSync(path, lines.join("\n"), "utf8");
}

main().catch((error: unknown) => {
  console.error("identity-backfill falló:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
