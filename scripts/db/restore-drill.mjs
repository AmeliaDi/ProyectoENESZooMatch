/**
 * `npm run db:restore-drill` — probar que un respaldo se puede restaurar, y
 * decir qué se rompe cuando alguien lo restaura «a mano» en una emergencia.
 *
 *   node --no-warnings scripts/db/restore-drill.mjs
 *   node --no-warnings scripts/db/restore-drill.mjs --no-naive    (omite la restauración ingenua)
 *   node --no-warnings scripts/db/restore-drill.mjs --lote=250    (filas por sentencia INSERT)
 *
 * Qué hace, en orden:
 *  1. Arma una base desechable (migraciones + seed + población sintética de
 *     `data/db-perf.json`) y le saca una huella: conteo y digest por tabla, más
 *     una huella del esquema.
 *  2. Genera `.qa/restore-drill/backup.sql`: INSERTs literales ordenados por
 *     dependencia de FK, con `DISABLE/ENABLE TRIGGER USER` por tabla (lo que
 *     emite `pg_dump --disable-triggers`) y, en el encabezado, la huella del
 *     esquema, el número de tablas y el de sentencias.
 *  3. Lee el archivo desde disco y restaura en una base vacía que solo tiene las
 *     migraciones. Antes de ejecutar nada valida el sobre: si la huella del
 *     destino no coincide con la del respaldo, o si el número de sentencias no
 *     cuadra, se rehúsa. Ese es el accidente real — datos de ayer sobre el
 *     esquema de hoy, o un archivo cortado a la mitad.
 *  4. Compara tabla por tabla: conteo Y digest. Cualquier diferencia falla.
 *  5. Segunda restauración SIN desactivar los triggers — lo que pasa si alguien
 *     corre `psql -f backup.sql` sin leer la receta. Se mide contra la base del
 *     paso 4, columna por columna, y se reporta como hallazgo, no como fallo:
 *     los 12 triggers de negocio son un hecho del esquema y lo que importa es
 *     qué columna movieron y en cuántas filas.
 *  6. Control negativo de contenido, al final, sobre la base del paso 4: borrar
 *     una fila y cambiar una columna tienen que ser detectados. Sin esto, un
 *     verde solo diría «no hay diferencias porque nada se revisa».
 *
 * Producción NO se toca: este paso nunca lee filas del proyecto remoto. El
 * restore de un respaldo real de Supabase es manual (docs/RESPALDOS.md) y por eso
 * el reporte lo lista como omitido en vez de darlo por hecho.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runnerImport } from "vite";

import { failed, finish, passed, qaDir, root, writeReport } from "./lib.mjs";
import { BASE_MIGRATION, SEED_FILE, localCatalog, migrationFiles, migrationPath, openLocal } from "./local-pg.mjs";
import { seedPopulation } from "./seed-population.mjs";

const VOLATILES = new Set(["rowCounts", "unavailable"]);
const ESQUEMAS = ["public", "private", "auth"];
/** `auth` aporta solo su tabla de identidades: ahí apuntan las FK de perfiles. */
const EN_AUTH = ["users"];
const MARCA = "\n--%%SENTENCIA%%--\n";

const loteArg = process.argv.find((a) => a.startsWith("--lote="));
const LOTE = loteArg ? Number.parseInt(loteArg.slice("--lote=".length), 10) : 500;
const hacerNaiva = !process.argv.includes("--no-naive");
if (!Number.isInteger(LOTE) || LOTE < 1) finish("db-restore-drill", failed(`--lote debe ser un entero positivo, no ${loteArg.slice("--lote=".length)}`));

const carpeta = resolve(qaDir, "restore-drill");
const rutaBackup = join(carpeta, "backup.sql").replaceAll("\\", "/");

// Los nombres salen del catálogo, no de una persona: si trajeran algo raro, se aborta.
function identificador(nombre, clase) {
  if (!/^[a-z_][a-z0-9_$]*$/i.test(nombre)) throw new Error(`nombre de ${clase} inesperado en el catálogo: ${JSON.stringify(nombre)}`);
  return nombre;
}
const qi = (nombre) => `"${identificador(nombre, "columna").replaceAll('"', '""')}"`;
const qtabla = (esquema, tabla) => `"${identificador(esquema, "esquema")}"."${identificador(tabla, "tabla")}"`;

/**
 * Digest de contenido por tabla. El renglón se arma columna por columna con
 * `quote_nullable`, así NULL y cadena vacía siguen siendo distintos, y el orden
 * no depende del orden físico: el mismo contenido en dos bases produce el mismo
 * md5, y un byte de diferencia lo cambia.
 */
function consultaDigest(esquema, tabla, columnas) {
  const tupla = `concat('${esquema}.${tabla}|', ${columnas.map((c) => `quote_nullable(${qi(c.nombre)}::text)`).join(", ")})`;
  return `select count(*)::bigint as filas, coalesce(md5(string_agg(t, E'\\n' order by t)), '(vacía)') as digest
            from (select ${tupla} as t from ${qtabla(esquema, tabla)}) s`;
}

/** Texto SQL de cada renglón con el tipo explícito: `cast('…' as uuid)`. */
function consultaTuplas(esquema, tabla, columnas) {
  const fragmentos = ["'('"];
  columnas.forEach((c, i) => {
    if (i > 0) fragmentos.push("','");
    if (!/^[a-z_][a-z0-9_ ]*(\([0-9, ]*\))?(\[[0-9]*\])?$/i.test(c.tipo)) {
      throw new Error(`tipo inesperado para ${esquema}.${tabla}.${c.nombre}: ${c.tipo}`);
    }
    fragmentos.push(`('cast(' || quote_nullable(${qi(c.nombre)}::text) || ' as ${c.tipo})')`);
  });
  fragmentos.push("')'");
  return `select concat(${fragmentos.join(", ")}) as tupla from ${qtabla(esquema, tabla)}`;
}

const cacheColumnas = new Map();
async function columnasDe(db, esquema, tabla) {
  const id = `${esquema}.${tabla}`;
  if (cacheColumnas.has(id)) return cacheColumnas.get(id);
  const { rows } = await db.query(
    `select a.attname as nombre, format_type(a.atttypid, a.atttypmod) as tipo
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      order by a.attnum`,
    [esquema, tabla],
  );
  if (rows.length === 0) throw new Error(`${id} no tiene columnas escribibles: el respaldo no podría cubrir la tabla`);
  cacheColumnas.set(id, rows);
  return rows;
}

async function digestTodo(db, ids) {
  const salida = {};
  for (const id of ids) {
    const [esquema, tabla] = id.split(".");
    const columnas = await columnasDe(db, esquema, tabla);
    const fila = (await db.query(consultaDigest(esquema, tabla, columnas))).rows[0];
    salida[id] = { filas: Number(fila.filas), digest: fila.digest };
  }
  return salida;
}

/** Orden de inserción: los padres antes que los hijos, ignorando autoreferencias. */
async function ordenPorDependencias(db, tablas) {
  const { rows } = await db.query(
    `select n.nspname || '.' || c.relname as hijo, rn.nspname || '.' || rc.relname as padre
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
      where con.contype = 'f'
        and (n.nspname = any($1) and (n.nspname <> 'auth' or c.relname = any($2)))
        and (rn.nspname = any($1) and (rn.nspname <> 'auth' or rc.relname = any($2)))`,
    [ESQUEMAS, EN_AUTH],
  );
  const padres = new Map();
  for (const { hijo, padre } of rows) {
    if (hijo === padre) continue;
    if (!padres.has(hijo)) padres.set(hijo, new Set());
    padres.get(hijo).add(padre);
  }
  const salida = [];
  const visitados = new Set();
  const pila = new Set();
  const visitar = (id) => {
    if (visitados.has(id)) return;
    if (pila.has(id)) throw new Error(`ciclo de claves foráneas que incluye ${id}: un respaldo plano no se puede restaurar en este esquema`);
    pila.add(id);
    for (const padre of [...(padres.get(id) ?? [])].sort()) visitar(padre);
    pila.delete(id);
    visitados.add(id);
    if (tablas.has(id)) salida.push(id);
  };
  for (const id of [...tablas].sort()) visitar(id);
  return salida;
}

/**
 * Huella del esquema: las mismas consultas de catálogo que usa `db:schema`, sin
 * los conteos de filas. Va escrita en el respaldo y se exige al restaurar, para
 * que este drill no se confunda con «los datos entraron en un esquema que ya no
 * es el mismo».
 */
async function huellaEsquema(db) {
  const catalogo = await localCatalog(db);
  const secciones = Object.keys(catalogo)
    .filter((k) => !VOLATILES.has(k) && Array.isArray(catalogo[k]))
    .sort();
  const texto = secciones
    .map((seccion) =>
      `${seccion}=` +
      catalogo[seccion]
        .map((fila) => Object.keys(fila).sort().map((campo) => `${campo}:${fila[campo] ?? ""}`).join(";"))
        .sort()
        .join("\n"),
    )
    .join("\n");
  return { huella: createHash("sha256").update(texto).digest("hex"), secciones: secciones.length };
}

/** Compara dos juegos de digest y devuelve solo lo que no coincide. */
function comparar(antes, despues) {
  const diferencias = [];
  for (const [id, esperado] of Object.entries(antes)) {
    const obtenido = despues[id];
    if (!obtenido) {
      diferencias.push({ tabla: id, tipo: "desapareció", esperado, obtenido: null });
      continue;
    }
    if (esperado.filas !== obtenido.filas) diferencias.push({ tabla: id, tipo: "conteo", esperado, obtenido });
    else if (esperado.digest !== obtenido.digest) diferencias.push({ tabla: id, tipo: "contenido", esperado, obtenido });
  }
  for (const [id, obtenido] of Object.entries(despues)) {
    if (!antes[id]) diferencias.push({ tabla: id, tipo: "inesperada", esperado: null, obtenido });
  }
  return diferencias;
}

/**
 * Sobre del respaldo: se valida antes de ejecutar la primera sentencia. Un
 * archivo truncado o generado contra otro esquema no llega a tocar la base.
 */
function abrirRespaldo(texto, { huellaDestino }) {
  const huella = /-- huella_esquema: ([0-9a-f]{64})/.exec(texto)?.[1] ?? null;
  if (!huella) throw new Error("el respaldo no trae huella de esquema en el encabezado: no se puede validar el destino");
  const declaradas = {
    tablas: Number.parseInt(/-- tablas: (\d+)/.exec(texto)?.[1] ?? "-1", 10),
    sentencias: Number.parseInt(/-- sentencias: (\d+)/.exec(texto)?.[1] ?? "-1", 10),
  };
  if (declaradas.tablas < 0 || declaradas.sentencias < 0) throw new Error("el encabezado del respaldo no declara cuántas tablas y sentencias contiene");
  if (huellaDestino !== undefined && huella !== huellaDestino) {
    throw new Error(`huella de esquema distinta (respaldo ${huella.slice(0, 12)}… vs destino ${huellaDestino.slice(0, 12)}…): restaurar aquí mezclaría dos esquemas`);
  }
  const trozos = texto.split(MARCA);
  if (trozos.length - 1 !== declaradas.sentencias) {
    throw new Error(`el respaldo declara ${declaradas.sentencias} sentencias y trae ${trozos.length - 1}: archivo truncado o incompleto`);
  }
  const sentencias = [];
  trozos.slice(1).forEach((sql, i) => {
    if (!/^\s*--/.test(sql) && !sql.trimEnd().endsWith(";")) {
      throw new Error(`la sentencia ${i} no termina en punto y coma: el archivo se rompió a la mitad`);
    }
    sentencias.push({ posicion: i, etiqueta: sql.trimStart().split("\n")[0].slice(0, 72), sql });
  });
  // La atomicidad es parte del respaldo, no una promesa del texto: se comprueba.
  if (!/^BEGIN;$/.test(sentencias[0]?.sql.trim() ?? "")) throw new Error("el respaldo no abre con BEGIN: restaurarlo no sería atómico");
  if (!/^COMMIT;$/.test(sentencias.at(-1)?.sql.trim() ?? "")) throw new Error("el respaldo no cierra con COMMIT: está truncado por el final");
  for (const s of sentencias.slice(1, -1)) {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK);/im.test(s.sql)) throw new Error(`la sentencia ${s.posicion} abre o cierra la transacción antes de tiempo`);
  }
  return { huella, declaradas, sentencias };
}

/**
 * Atribuye una diferencia de contenido a columnas concretas. Compara la base
 * restaurada correctamente contra la restaurada sin desactivar triggers, renglón
 * por renglón y alineadas por clave primaria: así el reporte dice QUÉ columna
 * movió un trigger y en cuántas filas, en lugar de «una tabla huele distinto».
 */
async function pkDe(db, esquema, tabla) {
  const { rows } = await db.query(
    `select a.attname as nombre
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join unnest(con.conkey) as k(attnum) on true
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
      where con.contype = 'p' and n.nspname = $1 and c.relname = $2
      order by array_position(con.conkey, a.attnum)`,
    [esquema, tabla],
  );
  return rows.map((r) => r.nombre);
}

async function atribuirDiferencia(dbCorrecta, dbIngenua, id) {
  const [esquema, tabla] = id.split(".");
  const pk = await pkDe(dbCorrecta, esquema, tabla);
  if (pk.length === 0) return { columna: null, nota: "la tabla no tiene clave primaria: las filas no se pueden alinear" };
  const claves = pk.map(qi).join(" || '·' || ");
  const orden = `order by ${pk.map(qi).join(", ")}`;
  const distintos = [];
  for (const c of await columnasDe(dbCorrecta, esquema, tabla)) {
    const sql = `select ${claves} as clave, quote_nullable(${qi(c.nombre)}::text) as v from ${qtabla(esquema, tabla)} ${orden}`;
    const a = (await dbCorrecta.query(sql)).rows;
    const b = (await dbIngenua.query(sql)).rows;
    let filas = 0;
    let ejemplo = null;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i]?.v !== b[i]?.v) {
        filas += 1;
        if (!ejemplo && a[i] && b[i]) ejemplo = { clave: String(a[i].clave).slice(0, 36), antes: String(a[i].v).slice(0, 60), despues: String(b[i].v).slice(0, 60) };
      }
    }
    if (filas > 0) distintos.push({ columna: c.nombre, filas, ejemplo });
  }
  return { clavePrimaria: pk, columnas: distintos };
}

/**
 * Ejecuta el respaldo sentencia por sentencia. `detenerEnError` define las dos
 * semantics: el restore correcto aborta al primer fallo (un respaldo roto no se
 * «sigue y se ve»), la pasada ingenua sigue para poder medir el daño.
 */
async function restaurar(db, sentencias, { detenerEnError }) {
  const errores = [];
  let ejecutadas = 0;
  const started = Date.now();
  for (const sentencia of sentencias) {
    if (/^\s*--/.test(sentencia.sql)) continue;
    try {
      await db.exec(sentencia.sql);
      ejecutadas += 1;
    } catch (error) {
      errores.push({ posicion: sentencia.posicion, etiqueta: sentencia.etiqueta, motivo: String(error?.message ?? error).split("\n")[0] });
      if (detenerEnError) return { ejecutadas, errores, detenido: true, elapsedMs: Date.now() - started };
    }
  }
  return { ejecutadas, errores, detenido: false, elapsedMs: Date.now() - started };
}

// ─── 1 · Base de origen y 2 · respaldo ───────────────────────────────────────

let siembra;
let ids;
let digestsOriginales;
let huellaOrigen;
let textoRespaldo;
let resumenRespaldo;

const origen = await openLocal();
try {
  const archivos = migrationFiles();
  if (archivos[0] !== BASE_MIGRATION) {
    finish("db-restore-drill", failed(`la primera migración debe ser ${BASE_MIGRATION}, no ${archivos[0]}`));
  }
  for (const archivo of archivos) {
    const r = await origen.apply(migrationPath(archivo));
    if (!r.ok) finish("db-restore-drill", failed(`${archivo}: ${r.error}`));
  }
  const semilla = await origen.apply(SEED_FILE);
  if (!semilla.ok) finish("db-restore-drill", failed(`${SEED_FILE}: ${semilla.error}`));

  const { module: configModule } = await runnerImport("/src/config/db-perf.ts", {
    configFile: false,
    root,
    resolve: { alias: { "@": `${root}/src` } },
    logLevel: "error",
  });
  siembra = await seedPopulation(origen.db, configModule.DB_PERF.poblacion);

  const lista = await origen.db.query(
    `select n.nspname as esquema, c.relname as tabla
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relkind in ('r', 'p')
        and (n.nspname <> 'auth' or c.relname = any($2))
      order by n.nspname, c.relname`,
    [ESQUEMAS, EN_AUTH],
  );
  ids = new Set(lista.rows.map((r) => `${r.esquema}.${r.tabla}`));
  if (ids.size < 20) finish("db-restore-drill", failed(`el respaldo cubriría solo ${ids.size} tablas: la base de origen no se ve completa`));

  huellaOrigen = await huellaEsquema(origen.db);
  digestsOriginales = await digestTodo(origen.db, ids);
  const filasTotales = Object.values(digestsOriginales).reduce((a, t) => a + t.filas, 0);
  console.log(`[db-restore-drill] origen: ${ids.size} tablas, ${filasTotales} filas, esquema ${huellaOrigen.huella.slice(0, 12)}…`);

  const orden = await ordenPorDependencias(origen.db, ids);
  const sentencias = [];
  const empujar = (sql) => sentencias.push({ posicion: sentencias.length, etiqueta: sql.split("\n")[0].slice(0, 72), sql });

  empujar("BEGIN;");

  // Fase de limpieza. No es un detalle local: `00000000000000_base.sql:284`
  // inserta la fila singleton de `private.pool_state`, así que un destino que ya
  // tiene las migraciones aplicadas NO está vacío y el INSERT choca contra él.
  // Un respaldo completo reemplaza el contenido: se limpia en orden inverso de
  // dependencia (los hijos antes que los padres) para no violar las FK.
  for (const id of [...orden].reverse()) {
    const [esquema, tabla] = id.split(".");
    empujar(`ALTER TABLE ${qtabla(esquema, tabla)} DISABLE TRIGGER USER;`);
    empujar(`DELETE FROM ${qtabla(esquema, tabla)};`);
    empujar(`ALTER TABLE ${qtabla(esquema, tabla)} ENABLE TRIGGER USER;`);
  }

  for (const id of orden) {
    const [esquema, tabla] = id.split(".");
    const columnas = await columnasDe(origen.db, esquema, tabla);
    empujar(`ALTER TABLE ${qtabla(esquema, tabla)} DISABLE TRIGGER USER;`);
    const { rows } = await origen.db.query(consultaTuplas(esquema, tabla, columnas));
    if (rows.length === 0) empujar(`-- ${id}: 0 filas`);
    const objetivos = `${qtabla(esquema, tabla)} (${columnas.map((c) => qi(c.nombre)).join(", ")})`;
    for (let i = 0; i < rows.length; i += LOTE) {
      const lote = rows.slice(i, i + LOTE);
      empujar(`INSERT INTO ${objetivos} VALUES\n${lote.map((r) => r.tupla).join(",\n")};`);
    }
    empujar(`ALTER TABLE ${qtabla(esquema, tabla)} ENABLE TRIGGER USER;`);
  }
  empujar("COMMIT;");

  const encabezado = [
    `-- ZooMatch · respaldo lógico (drill local: datos sintéticos, nunca producción)`,
    `-- generado: ${new Date().toISOString()}`,
    `-- poblacion: ${JSON.stringify(siembra)}`,
    `-- huella_esquema: ${huellaOrigen.huella}`,
    `-- tablas: ${orden.length}`,
    `-- sentencias: ${sentencias.length}`,
    `--`,
    `-- Cómo restaurar: base con las migraciones del proyecto aplicadas + este archivo.`,
    `-- Necesita un rol dueño de las tablas: los ALTER TABLE ... TRIGGER van aquí`,
    `-- porque los 12 triggers de negocio reescriben columnas al insertar, y un`,
    `-- respaldo que no los desactiva restaura otra cosa.`,
    `-- El archivo empieza borrando el contenido de cada tabla en orden inverso de`,
    `-- dependencia: hay filas que crean las propias migraciones (el singleton de`,
    `-- private.pool_state) y un respaldo completo las reemplaza, no las duplica.`,
  ].join("\n");
  textoRespaldo = `${encabezado}${sentencias.map((s) => `${MARCA}${s.sql}`).join("")}`;

  mkdirSync(carpeta, { recursive: true });
  writeFileSync(rutaBackup, textoRespaldo);
  const leido = readFileSync(rutaBackup, "utf8");
  if (leido !== textoRespaldo) finish("db-restore-drill", failed("el respaldo escrito en disco no coincide con el generado"));
  const sha256 = createHash("sha256").update(leido).digest("hex");
  resumenRespaldo = {
    ruta: rutaBackup,
    sha256,
    bytes: Buffer.byteLength(leido),
    sentencias: sentencias.length,
    tablas: orden.length,
    filas: filasTotales,
    lote: LOTE,
    orden,
  };
  console.log(`[db-restore-drill] respaldo: ${sentencias.length} sentencias, ${(resumenRespaldo.bytes / 1024 / 1024).toFixed(2)} MB, sha256 ${sha256.slice(0, 12)}…`);
  console.log(`[db-restore-drill] artefacto: ${rutaBackup}`);
} finally {
  await origen.close();
}

// ─── 3 · Sobre: guardas que se cumplen ANTES de tocar una fila ───────────────

const controles = [];
try {
  const truncado = textoRespaldo.slice(0, textoRespaldo.lastIndexOf(MARCA));
  abrirRespaldo(truncado, { huellaDestino: huellaOrigen.huella });
  controles.push({ control: "archivo truncado", detectado: false });
} catch (error) {
  controles.push({ control: "archivo truncado", detectado: true, motivo: String(error.message).slice(0, 120) });
}
try {
  abrirRespaldo(textoRespaldo, { huellaDestino: "0".repeat(64) });
  controles.push({ control: "esquema distinto al del respaldo", detectado: false });
} catch (error) {
  controles.push({ control: "esquema distinto al del respaldo", detectado: true, motivo: String(error.message).slice(0, 120) });
}

const paquete = abrirRespaldo(readFileSync(rutaBackup, "utf8"), { huellaDestino: huellaOrigen.huella });
if (paquete.declaradas.tablas !== ids.size) {
  finish("db-restore-drill", failed(`el respaldo declara ${paquete.declaradas.tablas} tablas y la base de origen tiene ${ids.size}`));
}
// ─── 4 · Restauración correcta ───────────────────────────────────────────────

const destino = await openLocal();
let restauracion;
let diferencias;
try {
  for (const archivo of migrationFiles()) {
    const r = await destino.apply(migrationPath(archivo));
    if (!r.ok) finish("db-restore-drill", failed(`restore: ${archivo}: ${r.error}`));
  }
  restauracion = await restaurar(destino.db, paquete.sentencias, { detenerEnError: true });
  if (restauracion.detenido) {
    const e = restauracion.errores[0];
    finish("db-restore-drill", failed(`restore detenido en la sentencia ${e.posicion} (${e.etiqueta}): ${e.motivo}`, { respaldo: resumenRespaldo }));
  }
  const huellaDestino = await huellaEsquema(destino.db);
  if (huellaDestino.huella !== huellaOrigen.huella) {
    finish("db-restore-drill", failed(`el esquema del destino no es el del respaldo (${huellaDestino.huella.slice(0, 12)}…): las guardas del sobre no alcanzaron`));
  }

  diferencias = comparar(digestsOriginales, await digestTodo(destino.db, ids));
  console.log(
    `[db-restore-drill] restore: ${restauracion.ejecutadas}/${paquete.sentencias.length} sentencias en ${(restauracion.elapsedMs / 1000).toFixed(1)} s · ${
      diferencias.length === 0 ? `${ids.size} tablas idénticas` : `${diferencias.length} tablas distintas`
    }`,
  );
  if (diferencias.length > 0) {
    finish("db-restore-drill", failed(`${diferencias.length} tabla(s) no coinciden después del restore`, {
      respaldo: resumenRespaldo,
      diferencias: diferencias.slice(0, 40),
    }));
  }
} catch (error) {
  await destino.close();
  throw error;
}
// `destino` sigue abierta a propósito: la pasada ingenua se compara contra ella
// para poder atribuir cada diferencia a una columna, y el control negativo se
// hace al final, cuando ya nadie compara contra esta base.

// ─── 5 · La pasada ingenua: sin desactivar triggers ─────────────────────────

let ingenua = null;
if (hacerNaiva) {
  const esTrigger = (s) => /^\s*ALTER\s+TABLE\s+.+\bTRIGGER\s+USER\s*;\s*$/i.test(s);
  const desnudas = paquete.sentencias.filter((s) => !esTrigger(s.sql));
  const mano = await openLocal();
  let distintas = [];
  let atribuidas = [];
  try {
    for (const archivo of migrationFiles()) {
      const r = await mano.apply(migrationPath(archivo));
      if (!r.ok) finish("db-restore-drill", failed(`restore ingenuo: ${archivo}: ${r.error}`));
    }
    const resultado = await restaurar(mano.db, desnudas, { detenerEnError: false });
    if (resultado.ejecutadas === 0) {
      finish("db-restore-drill", failed("la pasada ingenua no ejecutó ni una sentencia: su medida sería vacía, no un resultado", { errores: resultado.errores.slice(0, 5) }));
    }
    distintas = comparar(digestsOriginales, await digestTodo(mano.db, ids));
    for (const d of distintas.slice(0, 4)) atribuidas.push({ tabla: d.tabla, tipo: d.tipo, ...(await atribuirDiferencia(destino.db, mano.db, d.tabla)) });
    ingenua = {
      sentenciasEjecutadas: resultado.ejecutadas,
      de: desnudas.length,
      errores: resultado.errores.length,
      primerError: resultado.errores[0] ?? null,
      detenido: resultado.detenido,
      tablasDistintas: distintas.map((d) => `${d.tabla} (${d.tipo}: esperado ${d.esperado?.filas}, obtenido ${d.obtenido?.filas})`),
      tablasDiferentes: distintas.length,
      atribucion: atribuidas,
      elapsedMs: resultado.elapsedMs,
    };
    console.log(
      `[db-restore-drill] restore sin desactivar triggers: ${resultado.ejecutadas}/${desnudas.length} sentencias en ${(ingenua.elapsedMs / 1000).toFixed(1)} s · ${ingenua.errores} error(es), ${distintas.length} tabla(s) distintas`,
    );
    for (const a of atribuidas) {
      if (a.nota) {
        console.log(`    · ${a.tabla}: ${a.nota}`);
        continue;
      }
      for (const c of a.columnas ?? []) {
        console.log(`    · ${a.tabla}.${c.columna}: ${c.filas} fila(s) distintas (${String(c.ejemplo?.antes).slice(0, 26)} → ${String(c.ejemplo?.despues).slice(0, 26)})`);
      }
    }
    if (ingenua.primerError) console.log(`    · primer error: ${ingenua.primerError.etiqueta} — ${ingenua.primerError.motivo}`);
    writeReport("db-restore-drill-ingenuo", { generado: new Date().toISOString(), errores: resultado.errores.slice(0, 25), distintas: distintas.slice(0, 40), atribuidas });
  } finally {
    await mano.close();
  }
}

// ─── 6 · Control negativo de contenido, en la base restaurada correctamente ──

const danios = [];
let detectadas = [];
{
  const unaNotificacion = (await destino.db.query("select id from public.notifications order by id limit 1")).rows[0];
  if (!unaNotificacion) finish("db-restore-drill", failed("no hay notificaciones que dañar: el control negativo no puede medirse"));
  const cambio = await destino.db.query("update public.notifications set body = body || '.' where id = $1", [unaNotificacion.id]);
  danios.push({ tabla: "public.notifications", daño: "una columna modificada en una fila", filasAfectadas: cambio.affectedRows ?? 1 });

  const unMensaje = (await destino.db.query("select id from public.conversation_messages order by id limit 1")).rows[0];
  if (!unMensaje) finish("db-restore-drill", failed("no hay mensajes que borrar: el control negativo no puede medirse"));
  await destino.db.query("delete from public.conversation_messages where id = $1", [unMensaje.id]);
  danios.push({ tabla: "public.conversation_messages", daño: "una fila borrada", filasAfectadas: 1 });

  const alcance = new Set(danios.map((d) => d.tabla));
  const esperados = Object.fromEntries(Object.entries(digestsOriginales).filter(([id]) => alcance.has(id)));
  detectadas = comparar(esperados, await digestTodo(destino.db, alcance));
  await destino.close();
  console.log(`[db-restore-drill] control negativo: ${danios.length} daños provocados → ${detectadas.length} detectados`);
  for (const d of detectadas) {
    console.log(`    · ${d.tabla}: ${d.tipo} (esperado ${d.esperado.filas} filas/digest ${String(d.esperado.digest).slice(0, 8)}…, obtenido ${d.obtenido?.filas}/${String(d.obtenido?.digest).slice(0, 8)}…)`);
  }
  if (detectadas.length !== danios.length) {
    finish("db-restore-drill", failed(`el verificador de digestos no muerde: ${danios.length} daños provocados y ${detectadas.length} detectados`, { danios, detectadas }));
  }
  for (const d of danios) {
    if (!detectadas.some((x) => x.tabla === d.tabla)) {
      finish("db-restore-drill", failed(`el daño en ${d.tabla} (${d.daño}) no se detectó: el verde del restore no significa nada`, { danios, detectadas }));
    }
  }
}

// ─── Veredicto ───────────────────────────────────────────────────────────────

for (const c of controles) {
  if (!c.detectado) finish("db-restore-drill", failed(`el control «${c.control}» NO se detectó: la guarda del respaldo es decorativa`));
  console.log(`[db-restore-drill] control «${c.control}» → rechazado antes de ejecutar (${c.motivo ?? ""})`);
}

const hallazgos = [
  `respaldo de ${resumenRespaldo.tablas} tablas y ${resumenRespaldo.filas} filas en ${resumenRespaldo.ruta} (sha256 ${resumenRespaldo.sha256.slice(0, 16)}…)`,
  `restore verificado en ${(restauracion.elapsedMs / 1000).toFixed(1)} s: ${resumenRespaldo.tablas}/${resumenRespaldo.tablas} tablas con el mismo conteo y el mismo digest`,
  `controles detectados: ${controles.map((c) => c.control).join(", ")} + borrar una fila y cambiar una columna`,
];
if (ingenua && (ingenua.errores > 0 || ingenua.tablasDiferentes > 0)) {
  const columnas = (ingenua.atribucion ?? []).flatMap((a) => (a.columnas ?? []).map((c) => `${a.tabla}.${c.columna} en ${c.filas} fila(s)`));
  hallazgos.push(
    `restaurar sin DISABLE TRIGGER USER deja ${ingenua.tablasDiferentes} tabla(s) distintas y ${ingenua.errores} error(es)${
      columnas.length > 0 ? ` — mueve ${columnas.join(", ")}` : ""
    }: docs/RESPALDOS.md exige el respaldo con los triggers desactivados y por eso lo genera así`,
  );
} else if (ingenua) {
  hallazgos.push("restaurar sin desactivar los triggers NO cambió nada: los 12 triggers de negocio no reescriben columnas al insertar (medido, no asumido)");
}
hallazgos.push("PRODUCCIÓN: omitido — este drill usa solo la base local; el restore de un respaldo real de Supabase es el paso manual M-04 de docs/PENDIENTES_MANUALES.md");

finish(
  "db-restore-drill",
  passed({
    origen: "base desechable (PGlite): el drill nunca lee ni escribe en el proyecto remoto",
    poblacion: siembra,
    respaldo: resumenRespaldo,
    esquema: { huella: huellaOrigen.huella, secciones: huellaOrigen.secciones },
    sobre: { guardas: controles, sentenciasLeidas: paquete.sentencias.length },
    restauracion: { ejecutadas: restauracion.ejecutadas, de: paquete.sentencias.length, errores: restauracion.errores.length, elapsedMs: restauracion.elapsedMs, diferencias },
    controlNegativo: { danios, detectadas: detectadas.map((d) => ({ tabla: d.tabla, tipo: d.tipo })) },
    ingenua,
    produccion: {
      estado: "omitido",
      motivo:
        "la API de manejo de Supabase que usa este andamiaje es de solo lectura; restaurar un respaldo del proyecto requiere la consola de Supabase o pg_restore con credenciales de servicio, y eso es decisión humana",
      receta: "docs/RESPALDOS.md",
    },
    tablas: Object.entries(digestsOriginales).map(([tabla, v]) => ({ tabla, ...v })),
    hallazgos,
  }),
);
