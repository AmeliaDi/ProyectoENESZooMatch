/**
 * `npm run db:perf` — presupuestos de tiempo de las rutas calientes (Fase 5 del
 * prompt de QA de base de datos).
 *
 *   node scripts/db/perf.mjs                          corrida completa
 *   node scripts/db/perf.mjs --only=notify_matches,x  solo estos presupuestos
 *   node scripts/db/perf.mjs --no-production          sin el cruce con producción
 *
 * Mide contra un Postgres real pero desechable (PGlite, WASM) sembrado con la
 * población declarada en `data/db-perf.json`. Ninguna medición toca producción:
 * contra la base viva este script solo lee `pg_stat_statements` (metadatos
 * agregados) como referencia, y si la extensión o la credencial faltan lo
 * reporta como omitido con el motivo, en vez de inventar el número.
 *
 * Qué se mide y por qué así:
 *  - La MEDIANA de `medicion.repeticiones` corridas, no el promedio ni una sola
 *    muestra: en WASM la primera ejecución de un plan está fría.
 *  - Cada caso que escribe se prepara antes de la corrida cronometrada, de forma
 *    NO cronometrada, para que la medición vea el trabajo real y no un atajo
 *    idempotente. Medir `notify_matches` cinco veces sobre el mismo estado
 *    mediría cuatro no-ops y daría un verde falso.
 *  - `debe_usar_indice` no afirma que el planificador SIEMPRE elija el índice:
 *    sobre 600 filas un barrido secuencial puede ser la decisión correcta y más
 *    barata. Afirma algo más útil y verificable: que el predicado es atensible
 *    por ese índice, comprobado desactivando el seqscan y leyendo el plan.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { runnerImport } from "vite";

import { credentials, failed, finish, passed, qaDir, queryReadOnly, root } from "./lib.mjs";
import { BASE_MIGRATION, SEED_FILE, migrationFiles, migrationPath, openLocal, setSession } from "./local-pg.mjs";
import { seedPopulation, catálogo, sufijo, uuid } from "./seed-population.mjs";

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round2 = (n) => Math.round(n * 100) / 100;

const argOnly = process.argv.find((a) => a.startsWith("--only="));
const only = argOnly ? new Set(argOnly.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)) : null;
const quiereProduccion = !process.argv.includes("--no-production");

const { module: configModule } = await runnerImport("/src/config/db-perf.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
const CFG = configModule.DB_PERF;
const P = CFG.poblacion;
const M = CFG.medicion;
const MARCAS = CFG.entradas.marcas_de_muestra;
const DASH = CFG.entradas.dashboard;

const handle = await openLocal();
try {
  const files = migrationFiles();
  if (files[0] !== BASE_MIGRATION) {
    finish("db-perf", failed(`la primera migración debe ser ${BASE_MIGRATION}, no ${files[0]}`));
  }
  for (const file of files) {
    const result = await handle.apply(migrationPath(file));
    if (!result.ok) finish("db-perf", failed(`${file}: ${result.error}`));
  }
  const seed = await handle.apply(SEED_FILE);
  if (!seed.ok) finish("db-perf", failed(`${SEED_FILE}: ${seed.error}`));

  const db = handle.db;
  const siembra = await seedPopulation(db, P);

  // Sin estadísticas el planificador decide a ciegas, y un presupuesto medido
  // sobre un plan arbitrario no significa nada.
  await db.exec("ANALYZE;");

  const asText = (value) => (typeof value === "string" ? value : JSON.stringify(value));
  const pick = async (sql, params = []) => (await db.query(sql, params)).rows;
  const scalar = async (sql, params = []) => (await pick(sql, params))[0];

  // ─── Muestras concretas, todas derivadas de la siembra ─────────────────────

  const matriculaObjetivo = (
    await pick("select matricula_hash from public.profiles where user_id = $1", [uuid(MARCAS.perfiles_por_matricula)])
  )[0]?.matricula_hash;
  if (!matriculaObjetivo) {
    finish("db-perf", failed("entradas.marcas_de_muestra.perfiles_por_matricula no apunta a ningún perfil sembrado"));
  }

  const usuarioMatch = uuid(MARCAS.get_user_matches);
  const usuarioNotify = uuid(MARCAS.notify_matches);
  const paresEnBase = (await pick("select count(*)::int as n from public.matches"))[0].n;
  const payloadReplace = asText(
    (
      await pick(
        `select jsonb_agg(jsonb_build_object('track', track, 'user_a', user_a, 'user_b', user_b,
           'similarity', similarity, 'badges', badges)) as payload from public.matches`,
      )
    )[0].payload,
  );
  const idsPendientes = (
    await pick(
      `select id from public.notifications
       where user_id = $1 and read = false and type <> 'welcome' order by created_at desc, id limit 5`,
      [usuarioNotify],
    )
  ).map((r) => r.id);
  if (idsPendientes.length === 0) {
    finish("db-perf", failed("la bandeja de la muestra no tiene avisos sin leer: la siembra cambió de forma"));
  }
  const conversacionPeorCaso = (
    await pick(
      `select conversation_id as id from public.conversation_messages
       group by conversation_id order by count(*) desc, conversation_id limit 1`,
    )
  )[0]?.id;

  // Huevos reales de la siembra, a partir de la marca declarada. Se eclosionan
  // muestras DISTINTAS, una por corrida: re-eclosionar el mismo perfil devuelve
  // el alias guardado sin hacer ningún trabajo.
  const huevosFila = await pick(
    `select user_id from public.profiles
     where estado_identidad = 'huevo' and quiz_completed_at is not null and user_id >= $1
     order by user_id limit $2`,
    [uuid(MARCAS.hatch_profile_identity), M.muestra_hatch],
  );
  if (huevosFila.length < M.muestra_hatch) {
    finish("db-perf", failed(`la siembra solo dejó ${huevosFila.length} huevos desde la marca ${MARCAS.hatch_profile_identity} para una muestra de ${M.muestra_hatch}`));
  }
  const { animals: animales, colors: colores } = await catálogo(db);
  const huevos = huevosFila.map((h, k) => ({
    user_id: h.user_id,
    animal: animales[k % animales.length],
    color: colores[k % colores.length],
    sufijo: sufijo(100000 + k),
  }));

  await setSession(db, { userId: null, role: "service_role" });

  const CONSULTA_MATRICULA = `select user_id, estado_identidad, alias_completo, animal_id, color_id, params_version
     from public.profiles where matricula_hash = $1 limit 1`;

  // La versión del pool se releé antes de cada reescritura (ver preparar()).
  let versionPool = null;

  /** `preparar` corre fuera del cronómetro; `ejecutar` es la llamada de la app. */
  const casos = [
    {
      nombre: "perfiles_por_matricula",
      escenario: `búsqueda exacta por matricula_hash sobre ${P.perfiles} perfiles`,
      ejecutar: () => db.query(CONSULTA_MATRICULA, [matriculaObjetivo]),
      indice: { sql: CONSULTA_MATRICULA, params: [matriculaObjetivo], esperado: "profiles_matricula_hash_key" },
    },
    {
      nombre: "get_user_matches",
      escenario: `pares de una persona con top_k = ${P.top_k} por pista`,
      ejecutar: () => db.query("select * from public.get_user_matches($1)", [usuarioMatch]),
    },
    {
      nombre: "get_my_notifications",
      escenario: `bandeja sin leer con ${P.notificaciones_por_perfil} avisos sembrados por perfil`,
      preparar: () => setSession(db, { userId: usuarioNotify, role: "authenticated" }),
      ejecutar: () => db.query("select * from public.get_my_notifications($1)", [true]),
      terminar: () => setSession(db, { userId: null, role: "service_role" }),
    },
    {
      nombre: "mark_notifications_read",
      escenario: `UPDATE de ${idsPendientes.length} avisos por array de ids`,
      preparar: async () => {
        // El rebote se hace como service_role: `authenticated` no tiene UPDATE
        // en la tabla, y el propósito aquí es dejar el lote sin leer, no probar
        // privilegios. El cambio de sesión va DESPUÉS, para que lo cronometrado
        // sea exactamente la llamada de la app.
        await db.query("update public.notifications set read = false where id = any($1::uuid[])", [idsPendientes]);
        await setSession(db, { userId: usuarioNotify, role: "authenticated" });
      },
      ejecutar: () => db.query("select public.mark_notifications_read($1::uuid[])", [idsPendientes]),
      terminar: () => setSession(db, { userId: null, role: "service_role" }),
    },
    {
      nombre: "replace_matches",
      escenario: `borrado y reescritura del pool completo: ${paresEnBase} pares bajo advisory lock`,
      preparar: async () => {
        // La escritura sube la revisión del pool, así que la versión se releé
        // antes de cada corrida; si no, replace_matches devolvería -1.
        versionPool = (await pick("select public.get_pool_version() as v"))[0].v;
      },
      ejecutar: () => db.query("select public.replace_matches($1::jsonb, $2)", [payloadReplace, versionPool]),
    },
    {
      nombre: "notify_matches",
      escenario: "resumen de pares de una persona, borrado y reescrito",
      preparar: async () => {
        await db.query(
          "delete from public.notifications where user_id = $1 and type in ('match_romance','match_amistad','no_match')",
          [usuarioNotify],
        );
      },
      ejecutar: () => db.query("select public.notify_matches($1)", [usuarioNotify]),
    },
    {
      nombre: "get_admin_dashboard",
      escenario: `agregación de 5 argumentos (umbrales ${DASH.umbral_romance}/${DASH.umbral_amistad}, ventana ${DASH.ventana_dias} días) sobre ${P.perfiles} perfiles`,
      ejecutar: () =>
        db.query("select public.get_admin_dashboard($1, $2, $3, $4, $5)", [
          DASH.umbral_romance,
          DASH.umbral_amistad,
          DASH.referencia_romance,
          DASH.referencia_amistad,
          DASH.ventana_dias,
        ]),
    },
    {
      nombre: "hatch_profile_identity",
      escenario: `eclosión con SELECT ... FOR UPDATE sobre ${M.muestra_hatch} huevos distintos`,
      repeticiones: M.muestra_hatch,
      ejecutar: async (r) => {
        const h = huevos[r];
        await db.query("select public.hatch_profile_identity($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
          h.user_id,
          h.animal.id,
          h.color.id,
          h.animal.diminutivo,
          h.color.nombre,
          h.sufijo,
          `${h.animal.diminutivo} ${h.color.nombre} · ${h.sufijo}`,
          null,
          null,
          null,
        ]);
      },
    },
    {
      nombre: "get_pool_version",
      escenario: "lectura de la fila de control de revisión del pool",
      ejecutar: () => db.query("select public.get_pool_version()"),
    },
    {
      nombre: "mensajes_de_conversacion",
      escenario: `poll del chat: ${P.mensajes_por_conversacion} mensajes de la conversación más cargada, ordenados por created_at`,
      ejecutar: () =>
        db.query(
          `select id, author, body, created_at from public.conversation_messages
           where conversation_id = $1 order by created_at desc limit $2`,
          [conversacionPeorCaso, P.mensajes_por_conversacion],
        ),
    },
  ];

  // ─── Corrida ───────────────────────────────────────────────────────────────

  const resultados = [];
  for (const caso of casos) {
    const presupuesto = CFG.presupuestos[caso.nombre];
    if (!presupuesto) {
      finish("db-perf", failed(`el presupuesto «${caso.nombre}» no está declarado en data/db-perf.json`));
    }
    if (only && !only.has(caso.nombre)) {
      resultados.push({ medicion: caso.nombre, estado: "saltado", motivo: "excluido por --only" });
      continue;
    }
    if (presupuesto.debe_usar_indice && !caso.indice) {
      finish("db-perf", failed(`«${caso.nombre}» exige índice pero el caso no declara la consulta que lo prueba`));
    }

    const repeticiones = caso.repeticiones ?? M.repeticiones;
    const tiempos = [];
    for (let r = 0; r < repeticiones; r += 1) {
      if (caso.preparar) await caso.preparar(r);
      const started = performance.now();
      await caso.ejecutar(r);
      tiempos.push(performance.now() - started);
      if (caso.terminar) await caso.terminar(r);
    }

    const mediana = median(tiempos);
    const fila = {
      medicion: caso.nombre,
      escenario: caso.escenario,
      repeticiones,
      mediana_ms: round2(mediana),
      min_ms: round2(Math.min(...tiempos)),
      max_ms_medido: round2(Math.max(...tiempos)),
      presupuesto_ms: presupuesto.max_ms,
      estado: mediana <= presupuesto.max_ms ? "dentro" : "FUERA DE PRESUPUESTO",
    };

    if (caso.indice) {
      await db.exec("SET enable_seqscan = off;");
      try {
        const plan = await db.query(`EXPLAIN (FORMAT JSON) ${caso.indice.sql}`, caso.indice.params);
        const texto = JSON.stringify(plan.rows[0]["QUERY PLAN"]);
        fila.indice_esperado = caso.indice.esperado;
        fila.indice_usable = texto.includes(caso.indice.esperado);
        if (!fila.indice_usable) fila.estado = "FUERA DE PRESUPUESTO";
      } finally {
        await db.exec("SET enable_seqscan = on;");
      }
    }
    resultados.push(fila);
    console.log(
      `${fila.estado === "dentro" ? "✓" : "✗"} ${caso.nombre.padEnd(24)} mediana ${String(fila.mediana_ms).padStart(7)} ms / presupuesto ${String(presupuesto.max_ms).padStart(5)} ms · ${repeticiones} corrida(s)`,
    );
  }

  const escenario = {
    ...siembra,
    repeticiones_por_medicion: M.repeticiones,
    muestra_hatch: M.muestra_hatch,
    pares_en_base: paresEnBase,
  };

  // ─── Cruce con producción: solo metadatos agregados de pg_stat_statements ──

  let produccion = null;
  if (quiereProduccion) {
    if (!credentials()) {
      produccion = { estado: "omitido", motivo: "sin SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL" };
    } else {
      const RUTAS = ["get_user_matches", "replace_matches", "notify_matches", "get_admin_dashboard", "hatch_profile_identity", "get_pool_version", "get_my_notifications", "mark_notifications_read"];
      const sql = `select case
${RUTAS.map((r) => `          when query ilike '%public.${r}%' then '${r}'`).join("\n")}
          when query ilike '%public.profiles%' and query ilike '%matricula_hash%' then 'perfiles_por_matricula'
          when query ilike '%public.conversation_messages%' then 'mensajes_de_conversacion'
          else null end as medicion,
        sum(calls)::bigint as llamadas,
        round(max(mean_exec_time)::numeric, 2) as peor_media_ms
      from pg_stat_statements
      where query not ilike '%pg_stat_statements%'
      group by 1 order by 1`;
      try {
        const filas = (await queryReadOnly(sql)).filter((f) => f.medicion);
        produccion = {
          estado: filas.length > 0 ? "disponible" : "sin_tráfico",
          motivo: filas.length > 0 ? null : "pg_stat_statements no registró todavía ninguna de estas rutas",
          filas,
        };
      } catch (error) {
        produccion = { estado: "omitido", motivo: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
      }
    }
    console.log(`· cruce con producción: ${produccion.estado}${produccion.motivo ? ` · ${produccion.motivo}` : ""}`);
  }

  mkdirSync(qaDir, { recursive: true });
  const evidencia = resolve(root, ".qa", "db-perf-medido.json");
  writeFileSync(evidencia, `${JSON.stringify({ generado: new Date().toISOString(), escenario, resultados, produccion }, null, 2)}\n`);

  const extra = { escenario, resultados, produccion, medido_en: evidencia };
  const fallidos = resultados.filter((r) => r.estado === "FUERA DE PRESUPUESTO");
  if (fallidos.length > 0) {
    finish(
      "db-perf",
      failed(
        `${fallidos.length} medición(es) fuera de presupuesto: ${fallidos.map((f) => `${f.medicion} ${f.mediana_ms} ms > ${f.presupuesto_ms} ms`).join(", ")}`,
        extra,
      ),
    );
  }
  finish(
    "db-perf",
    passed({
      ...extra,
      sugerencia_max_ms: Object.fromEntries(resultados.filter((r) => r.mediana_ms !== undefined).map((r) => [r.medicion, r.mediana_ms])),
      nota: "data/db-perf.json guarda el presupuesto; docs/QA_DB.md registra la mediana y si el número también se verificó en producción",
    }),
  );
} finally {
  await handle.close();
}
