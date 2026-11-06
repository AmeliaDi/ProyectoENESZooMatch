/**
 * Fase 2 — Reporte y reasignación controlada de colores en producción
 *
 * Calcula con la lógica corregida (`buildAvatarSpec` con distribución
 * posterior ponderada y semilla determinista por `user_id`) el color que le
 * correspondería a cada perfil completado en producción y entrega la
 * distribución antes/después sin imprimir matrículas, hashes ni respuestas.
 *
 * Modos:
 *   node --no-warnings scripts/recompute-colors-report.mts --dry-run (por defecto)
 *   node --no-warnings scripts/recompute-colors-report.mts --apply-neblina --confirm-neblina-reassign
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

import type { LatentProfile } from "../src/types/latent.ts";
import type { AvatarParams, AvatarSpec } from "../src/domain/avatars/avatar-spec.ts";

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

interface CompletedProfileRow {
  user_id: string;
  color_id: string;
  latent_profile: LatentProfile;
}

function shannonEntropy(counts: ReadonlyMap<string, number>, total: number): number {
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log(p);
    }
  }
  return h;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyNeblina = args.includes("--apply-neblina");
  const confirmed = args.includes("--confirm-neblina-reassign");

  if (applyNeblina && !confirmed) {
    throw new Error(
      "Refusing to reassign colors in production without --confirm-neblina-reassign flag.",
    );
  }

  const root = fileURLToPath(new URL("..", import.meta.url));
  const avatarModule = (await runnerImport("/src/domain/avatars/avatar-spec.ts", {
    configFile: false,
    root,
    resolve: { alias: { "@": `${root}/src` } },
    logLevel: "error",
  })).module as {
    buildAvatarSpec: (profile: LatentProfile, params: AvatarParams, seed?: string) => AvatarSpec;
  };

  const matchingConfig = JSON.parse(
    readFileSync(resolve(root, "data/matching-config.json"), "utf8"),
  ) as {
    scoring: { enneagram_ambiguity_entropy: { valor: number } };
    categories: { eneagrama: { temperature: { valor: number } } };
  };
  const catalogColors = (
    JSON.parse(readFileSync(resolve(root, "data/arquetipos.json"), "utf8")) as {
      colores: Array<{ id: string; nombre: string }>;
    }
  ).colores;

  const params: AvatarParams = {
    temperature: matchingConfig.categories.eneagrama.temperature.valor,
    ambiguityEntropy: matchingConfig.scoring.enneagram_ambiguity_entropy.valor,
  };

  const rows = await runSql<CompletedProfileRow>(`
    SELECT user_id::text AS user_id, color_id, latent_profile
    FROM public.profiles
    WHERE quiz_completed_at IS NOT NULL
    ORDER BY created_at ASC, user_id ASC;
  `);

  const beforeCounts = new Map<string, number>();
  const afterNeblinaOnlyCounts = new Map<string, number>();
  const afterAllCounts = new Map<string, number>();
  for (const c of catalogColors) {
    beforeCounts.set(c.id, 0);
    afterNeblinaOnlyCounts.set(c.id, 0);
    afterAllCounts.set(c.id, 0);
  }

  let neblinaBefore = 0;
  let neblinaChangedCount = 0;
  let nonNeblinaChangedCount = 0;
  const neblinaUpdates: Array<{ userId: string; newColorId: string }> = [];

  for (const row of rows) {
    const currentColor = row.color_id;
    const spec = avatarModule.buildAvatarSpec(row.latent_profile, params, row.user_id);
    const recomputedColor = spec.colorId;

    beforeCounts.set(currentColor, (beforeCounts.get(currentColor) ?? 0) + 1);
    afterAllCounts.set(recomputedColor, (afterAllCounts.get(recomputedColor) ?? 0) + 1);

    if (currentColor === "ennea-neblina") {
      neblinaBefore += 1;
      afterNeblinaOnlyCounts.set(
        recomputedColor,
        (afterNeblinaOnlyCounts.get(recomputedColor) ?? 0) + 1,
      );
      if (recomputedColor !== "ennea-neblina") {
        neblinaChangedCount += 1;
        neblinaUpdates.push({ userId: row.user_id, newColorId: recomputedColor });
      }
    } else {
      afterNeblinaOnlyCounts.set(
        currentColor,
        (afterNeblinaOnlyCounts.get(currentColor) ?? 0) + 1,
      );
      if (recomputedColor !== currentColor) {
        nonNeblinaChangedCount += 1;
      }
    }
  }

  const total = rows.length;
  const entropyBefore = shannonEntropy(beforeCounts, total);
  const entropyAfterNeblinaOnly = shannonEntropy(afterNeblinaOnlyCounts, total);
  const entropyAfterAll = shannonEntropy(afterAllCounts, total);

  const colorSummary = catalogColors.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    before: beforeCounts.get(c.id) ?? 0,
    beforePct: Number((((beforeCounts.get(c.id) ?? 0) / total) * 100).toFixed(2)),
    afterReassignNeblina: afterNeblinaOnlyCounts.get(c.id) ?? 0,
    afterReassignNeblinaPct: Number(
      (((afterNeblinaOnlyCounts.get(c.id) ?? 0) / total) * 100).toFixed(2),
    ),
  }));

  let maxAfterColor = "";
  let maxAfterCount = 0;
  for (const item of colorSummary) {
    if (item.afterReassignNeblina > maxAfterCount) {
      maxAfterCount = item.afterReassignNeblina;
      maxAfterColor = item.id;
    }
  }

  if (applyNeblina && confirmed && neblinaUpdates.length > 0) {
    const cases = neblinaUpdates
      .map((u) => `WHEN '${u.userId}'::uuid THEN '${u.newColorId}'`)
      .join(" ");
    const ids = neblinaUpdates.map((u) => `'${u.userId}'::uuid`).join(", ");
    await runSql(`
      BEGIN;
      UPDATE public.profiles
      SET color_id = CASE user_id ${cases} ELSE color_id END,
          color_asignado_en = now()
      WHERE user_id IN (${ids}) AND color_id = 'ennea-neblina';
      COMMIT;
    `);
  }

  console.log(
    JSON.stringify(
      {
        mode: applyNeblina ? "APPLIED_NEBLINA_REASSIGN" : "DRY_RUN",
        totalCompletedProfiles: total,
        neblinaBeforeCount: neblinaBefore,
        neblinaBeforePct: Number(((neblinaBefore / total) * 100).toFixed(2)),
        neblinaWouldChangeCount: neblinaChangedCount,
        neblinaStayingNeblinaCount: neblinaBefore - neblinaChangedCount,
        nonNeblinaWouldChangeCount: nonNeblinaChangedCount,
        entropyBeforeNats: Number(entropyBefore.toFixed(4)),
        entropyAfterReassignNeblinaNats: Number(entropyAfterNeblinaOnly.toFixed(4)),
        entropyAfterAllNats: Number(entropyAfterAll.toFixed(4)),
        maxColorShareAfterReassignNeblina: {
          colorId: maxAfterColor,
          count: maxAfterCount,
          pct: Number(((maxAfterCount / total) * 100).toFixed(2)),
        },
        distribution: colorSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("recompute-colors-report failed:", err);
  process.exit(1);
});
