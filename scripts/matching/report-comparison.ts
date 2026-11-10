/**
 * Markdown rendering of the shadow comparison (docs/COMPARATIVA_MODELOS.md).
 * Generated file: do not edit by hand.
 */
import type { RolloutGates } from "@/types/rollout-gates";

import type { ShadowResult } from "./shadow";

const f = (x: number, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)} %`;
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export function renderComparison(result: ShadowResult, gates: RolloutGates): string {
  const [incumbent, candidate] = result.measurements;
  if (!incumbent || !candidate) throw new Error("comparison needs both measurements");
  const { decision } = result;

  const trackRows = (["romance", "amistad"] as const).flatMap((track) => {
    const a = incumbent.tracks[track];
    const b = candidate.tracks[track];
    return [
      [`${track} · cobertura (pool)`, pct(a.poolCoverage), pct(b.poolCoverage), `entre ${pct(gates.cobertura[track].min)} y ${pct(gates.cobertura[track].max)}`],
      [`${track} · Gini de exposición`, f(a.gini), f(b.gini), `≤ ${f(gates.exposicion.gini_max[track])} y ≤ el vigente`],
      [`${track} · equidad (mín/mediana)`, f(a.equityFloor), f(b.equityFloor), `≥ ${f(gates.equidad.min_ratio, 2)}`],
      [`${track} · ρ de rangos vs vigente`, "1.0000", f(b.spearmanVsIncumbent), `≥ ${f(gates.correlacion_rangos.min_spearman, 2)}`],
      [`${track} · ρ bajo ruido`, f(a.noise.spearman), f(b.noise.spearman), `≥ ${f(gates.estabilidad_ruido.min_spearman, 2)}`],
      [`${track} · Jaccard bajo ruido`, f(a.noise.jaccard), f(b.noise.jaccard), `≥ ${f(gates.estabilidad_ruido.min_jaccard, 2)}`],
    ];
  });

  const gateRows = decision.gates.map((g) => [
    g.id,
    g.label,
    g.observed,
    g.required,
    g.passed ? "PASA" : "FALLA",
  ]);

  const failed = decision.gates.filter((g) => !g.passed);

  return [
    "# Comparativa de motores de matching",
    "",
    "> Archivo generado por `node scripts/matching/run-shadow.mjs`. No editar a mano.",
    "> Evidencia sintética y reproducible: no contiene datos de producción.",
    "",
    `Semilla ${result.seed}, N=${result.population}, hash de entradas \`${result.inputHash.slice(0, 16)}\`, corrida ${(result.elapsedMs / 1000).toFixed(1)} s, generada ${result.generatedAt} (la hora vive también en \`.qa/rollout.json\`; lo reproducible es el hash de entradas, no la marca de tiempo).`,
    "",
    "## Decisión",
    "",
    decision.activate
      ? `**ACTIVAR \`${result.candidate}\`.** Las ${decision.gates.length} compuertas pasan. Pasos manuales en «Activación» abajo.`
      : `**NO ACTIVAR. Se mantiene \`${result.incumbent}\`.** Fallan ${failed.length} de ${decision.gates.length} compuertas: ${decision.failed.map((id) => `\`${id}\``).join(", ")}.`,
    "",
    "Las compuertas son una conjunción: no hay puntaje ponderado ni override. Una sola que falle bloquea la activación y el motivo queda registrado abajo.",
    "",
    "## Motores comparados",
    "",
    `- **\`${result.incumbent}\` (vigente):** soft-min por capas sobre las posterioriales latentes, consciente de la incertidumbre (SE), cortado en el cuantil calibrado de la nula por permutación. Es el que la app usa hoy.`,
    `- **\`${result.candidate}\` (candidato, en sombra):** coseno no centrado de los vectores descriptivos [0, 1] del track. Es la idea del motor anterior, conservada seleccionable ÚNICAMENTE para que la corrida sombra tenga una alternativa real que juzgar. Ignora la incertidumbre, los pisos y el soft-min.`,
    "",
    "Ambos comparten filtros duros, el corte calibrado, top-K, orden canónico y deduplicación (`computeWith`), así que la comparación aísla la regla de puntaje y nada más. El candidato se calcula y se almacena como agregado interno; **no se muestra a nadie**.",
    "",
    "## Mediciones por track",
    "",
    table(["Métrica", `Vigente (${result.incumbent})`, `Candidato (${result.candidate})`, "Compuerta"], trackRows),
    "",
    `Tiempo de cómputo: vigente ${f(incumbent.elapsedMs, 0)} ms, candidato ${f(candidate.elapsedMs, 0)} ms sobre ${candidate.pairs} pares evaluados (${f((candidate.elapsedMs * 1000) / Math.max(1, candidate.pairs), 2)} ms por mil pares; presupuesto ${f(gates.tiempo.max_ms_por_mil_pares, 2)} ms).`,
    "",
    `Violaciones estructurales (simetría, orden canónico, duplicados, auto-match, rango): vigente ${incumbent.violations}, candidato ${candidate.violations}.`,
    "",
    "## Compuertas",
    "",
    table(["Id", "Compuerta", "Observado", "Requerido", "Estado"], gateRows),
    "",
    ...(failed.length === 0
      ? []
      : [
          "## Motivos por los que no se activa",
          "",
          ...failed.map((g) => `- **\`${g.id}\`** — ${g.reason}`),
          "",
          "### Recomendación",
          "",
          `Mantener \`${result.incumbent}\`. El candidato no debe activarse mientras falle alguna compuerta; relajar un umbral para que pase está prohibido por el prompt de afinación y por \`data/rollout-gates.json\`. Si se quiere un motor distinto, hay que cambiar la regla de puntaje y volver a medir, no bajar la vara.`,
          "",
        ]),
    "## Conservación de conversaciones abiertas",
    "",
    `Parejas protegidas en esta corrida: **${result.protectedPairs}** (origen: **${result.protectedSource}**, muestra sembrada de lo que publica el vigente). El candidato perdería **${candidate.lostProtectedPairs}** si se reemplazara el conjunto tal cual; la compuerta exige ${gates.conservacion.max_perdida}.`,
    "",
    "**Esto es una garantía estructural, no una esperanza:** `public.conversations` y `public.chat_interests` referencian solo `public.profiles`, nunca `public.matches` (`supabase/migrations/00000000000000_base.sql`). `replace_matches` hace `DELETE FROM public.matches WHERE true` bajo un advisory lock y un guard de versión de pool, pero no puede cascadear hacia una conversación. Aun así, la activación no reemplaza a ciegas: `conserveProtected(next, protectedPairs)` vuelve a publicar toda pareja protegida que el motor nuevo no produzca, con su similitud ya almacenada, y es idempotente.",
    "",
    "**Pero esa garantía hoy solo cubre la activación, no el recálculo ordinario:** `recomputeMatches` (`src/application/recompute-matches.ts:36-51`) calcula y llama `replaceAll` sin leer las parejas protegidas, así que el camino que recorre `POST /api/admin/recompute` puede dejar conversaciones sin par. Medido en producción: 71 conversaciones sin par vigente, 5 abiertas después del último recálculo. Es el hallazgo DB-19 de `docs/QA_DB.md` y el paso M-13 de `docs/PENDIENTES_MANUALES.md`.",
    "",
    "Antes de activar contra producción hay que extraer el conjunto REAL de parejas con conversación abierta con `supabase/maintenance/protected-pairs.sql` (solo lectura, agregado y digest) y volver a correr la compuerta. Medido en producción el 2026-11-10: **122 pares protegidos** (88 de amistad, 34 de romance), 58 con al menos un mensaje escrito, digest `bb5d73b21bc77494072e2ffd5cac1173`; y en el espejo, 71 conversaciones cuyo par ya no está en `matches` (hallazgo DB-19 en `docs/QA_DB.md`). Esta corrida usa un conjunto sembrado porque el acceso disponible es de agregados y no se inventan datos: el archivo devuelve conteos y la huella del conjunto, no la lista.",
    "",
    "## Activación (solo si todas las compuertas pasan)",
    "",
    "1. Extraer las parejas protegidas reales (SQL de solo lectura arriba) y volver a correr `node scripts/matching/run-shadow.mjs` con ese conjunto.",
    "2. Respaldar antes de tocar nada: `node --no-warnings scripts/db-backup.mts --out .backups/pre-rollout`.",
    "3. Aplicar la migración del tipo de notificación. Está preparada y probada sobre la base local en `supabase/maintenance/pending/20261126000000_afinidad_notification.sql`, y NO se ejecuta en producción por un agente: mientras vive en `pending/` no forma parte del esquema del repo porque `npm run db:migrate-test` exige que las migraciones repliquen producción sin diferencias, y esta agrega 1 índice y ensancha 1 CHECK. Para aplicarla: mover el archivo a `supabase/migrations/`, correr `npm run db:schema` para refrescar la línea base, voltear la aserción de `supabase/tests/01_esquema.sql` que hoy exige que `afinidad_afinada` se rechace, y entonces `node scripts/db-apply.mjs --migration supabase/migrations/20261126000000_afinidad_notification.sql`.",
    "4. Activar el flag: `MATCHING_ENGINE=coseno` en el entorno del deploy (el nombre lo fija `data/rollout-gates.json → activacion.variable`).",
    "5. Recalcular de forma idempotente conservando las parejas protegidas (`conserveProtected`), y enviar UNA sola notificación por persona del tipo `afinidad_afinada`: «Afinamos tu afinidad — revisa tus matches». Sin spam, sin cambios abruptos de constelación.",
    "",
    "## Rollback (un solo comando, en ambos casos)",
    "",
    "```bash",
    "# Quita la variable del entorno del deploy y recalcula con el motor vigente:",
    "vercel env rm MATCHING_ENGINE production --yes && vercel redeploy --prod",
    "```",
    "",
    `Sin la variable, \`getMatchingEngine()\` resuelve a \`${result.incumbent}\` (\`DEFAULT_ENGINE\`). Un valor desconocido lanza en el arranque en vez de elegir un motor en silencio, así que un typo en el flag es un bug de deploy visible, no una activación accidental. El recálculo es idempotente y las conversaciones abiertas nunca se tocan.`,
    "",
    "## Trazabilidad",
    "",
    `- Umbrales: \`data/rollout-gates.json\` (cada número con \`{valor, etiqueta, fuente}\`).`,
    `- Compuertas: \`src/domain/matching/rollout.ts\`, pruebas \`src/domain/matching/rollout.test.ts\`.`,
    `- Motores: \`src/domain/matching/engine.ts\`, pruebas \`src/domain/matching/engine.test.ts\`.`,
    `- Corrida sombra: \`scripts/matching/shadow.ts\`, agregados en \`.qa/rollout.json\`.`,
    `- Línea base del vigente: \`docs/MATCHING_RESULTADOS.md\`.`,
    "",
  ].join("\n");
}