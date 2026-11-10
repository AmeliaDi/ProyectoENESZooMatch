/**
 * Exports a JSON snapshot of every ZooMatch table in `auth`, `public`, and
 * `private` to an out-of-git backup directory (`.backups/<label>`).
 *
 * The table list comes from the live catalog, never from a hardcoded array: a
 * snapshot that silently omits a table is worse than one that fails. Every
 * export carries an ORDER BY so the same data always produces the same sha256.
 *
 * Usage:
 *   node --no-warnings scripts/db-backup.mts --out .backups/pre-fase1
 *   node --no-warnings scripts/db-backup.mts --plan      (conteos, cero filas)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Tabla = {
  full: string;
  esquema: string;
  nombre: string;
  columnas: string[];
  orderBy: string;
  ordenDesde: "clave primaria" | "todas las columnas";
};

/**
 * Las 21 tablas que la versión anterior de este script llegaba a exportar; solo
 * alimenta el diff de cobertura. El arreglo viejo declaraba un `orderBy` por
 * tabla que NUNCA se usaba —la consulta no llevaba ORDER BY— y dos de esos
 * nombres de columna ya no existen, así que el orden se resuelve contra la
 * clave primaria viva.
 */
const RESPALDADAS_ANTES = new Set([
  "auth.users",
  "public.profiles",
  "public.quiz_responses",
  "public.matches",
  "public.notifications",
  "public.chat_pins",
  "public.chat_security_events",
  "public.chat_interests",
  "public.conversations",
  "public.conversation_rounds",
  "public.conversation_answers",
  "public.conversation_messages",
  "public.conversation_reactions",
  "public.chat_feedback_daily",
  "public.chat_blocks",
  "public.chat_closures",
  "public.chat_reports",
  "public.chat_report_audit",
  "public.admin_credentials",
  "public.admin_audit",
  "private.access_guard",
]);

const IDENTIFICADOR = /^[a-z_][a-z0-9_$]{0,62}$/i;

function validarIdentificador(nombre: string, contexto: string): string {
  if (!IDENTIFICADOR.test(nombre)) {
    throw new Error(`${contexto}: «${nombre.slice(0, 60)}» no es un identificador válido`);
  }
  return `"${nombre}"`;
}

/**
 * Todo nombre que se interpola en SQL pasa por aquí: el catálogo es texto que
 * llega de la base y no puede entrar en una consulta sin validación.
 */
function validarOrden(columnas: string[], full: string): string {
  const limpias = columnas.map((c) => c.trim()).filter(Boolean);
  if (limpias.length === 0) {
    throw new Error(`${full}: el catálogo devolvió cero columnas, no se puede ordenar el respaldo`);
  }
  return limpias.map((columna) => validarIdentificador(columna, `columna de ${full}`)).join(", ");
}

function readEnv(): { projectRef: string; token: string } {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const get = (k: string): string =>
    env.match(new RegExp(`^${k}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"))?.[1]?.trim() ?? "";
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = url.match(/https:\/\/([a-z0-9]+)/)?.[1] ?? "";
  const token = get("SUPABASE_ACCESS_TOKEN");
  if (!projectRef || !token) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local");
  }
  return { projectRef, token };
}

async function querySql(projectRef: string, token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Backup query failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

const texto = (v: unknown): string => String(v ?? "");
const entero = (v: unknown): number => Number(v ?? 0);

const citas = (tabla: Tabla): string =>
  `${validarIdentificador(tabla.esquema, "esquema")}.${validarIdentificador(tabla.nombre, "tabla")}`;

/** Inventario vivo: tablas de `public` y `private`, más la tabla real de `auth`. */
async function inventario(projectRef: string, token: string): Promise<Tabla[]> {
  const filas = await querySql(
    projectRef,
    token,
    `SELECT n.nspname AS esquema, c.relname AS nombre,
            string_agg(a.attname, ',' ORDER BY a.attnum) AS columnas
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p')
        AND (n.nspname IN ('public', 'private') OR (n.nspname = 'auth' AND c.relname = 'users'))
      GROUP BY n.nspname, c.relname
      ORDER BY n.nspname, c.relname;`,
  );

  const pkFilas = await querySql(
    projectRef,
    token,
    `SELECT n.nspname AS esquema, c.relname AS nombre,
            string_agg(a.attname, ',' ORDER BY array_position(con.conkey, a.attnum)) AS pk
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
      WHERE con.contype = 'p'
      GROUP BY n.nspname, c.relname;`,
  );
  const pkPorTabla = new Map(pkFilas.map((f) => [`${texto(f.esquema)}.${texto(f.nombre)}`, texto(f.pk)]));

  return filas.map((fila) => {
    const esquema = texto(fila.esquema);
    const nombre = texto(fila.nombre);
    const full = `${esquema}.${nombre}`;
    const columnas = texto(fila.columnas)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const pk = pkPorTabla.get(full) ?? "";
    const eleccion: { columnas: string[]; ordenDesde: Tabla["ordenDesde"] } = pk
      ? { columnas: pk.split(","), ordenDesde: "clave primaria" }
      : { columnas, ordenDesde: "todas las columnas" };

    const presentes = new Set(columnas);
    const ausentes = eleccion.columnas.map((c) => c.trim()).filter((c) => !presentes.has(c));
    if (ausentes.length > 0) {
      throw new Error(`${full}: el orden resuelto cita columnas que el catálogo no lista (${ausentes.join(", ")})`);
    }

    return {
      full,
      esquema,
      nombre,
      columnas,
      orderBy: validarOrden(eleccion.columnas, full),
      ordenDesde: eleccion.ordenDesde,
    };
  });
}

async function contar(projectRef: string, token: string, tabla: Tabla): Promise<number> {
  const filas = await querySql(projectRef, token, `SELECT count(*)::bigint AS filas FROM ${citas(tabla)};`);
  return entero(filas[0]?.filas);
}

async function main(): Promise<void> {
  const planOnly = process.argv.includes("--plan");
  const outIdx = process.argv.indexOf("--out");
  const outArg = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), outArg ?? `.backups/${planOnly ? "plan" : "snapshot"}-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const { projectRef, token } = readEnv();
  const tablas = await inventario(projectRef, token);
  if (tablas.length === 0) throw new Error("el catálogo no devolvió ninguna tabla: no hay nada que respaldar");
  const nuevas = tablas.filter((t) => !RESPALDADAS_ANTES.has(t.full));

  if (planOnly) {
    console.log(`[db-backup --plan] cobertura contra el catálogo vivo (${projectRef}) — solo conteos, cero filas exportadas`);
    const plan: Array<{ tabla: string; filas: number; orden: Tabla["ordenDesde"]; respaldadaAntes: boolean }> = [];
    let totalFilas = 0;
    for (const tabla of tablas) {
      const filas = await contar(projectRef, token, tabla);
      totalFilas += filas;
      const antes = RESPALDADAS_ANTES.has(tabla.full);
      plan.push({ tabla: tabla.full, filas, orden: tabla.ordenDesde, respaldadaAntes: antes });
      console.log(
        `  ${tabla.full.padEnd(34)} filas=${String(filas).padStart(6)}  orden=${tabla.ordenDesde.padEnd(19)}${antes ? "" : "← antes NO se respaldaba"}`,
      );
    }
    const resumen = {
      createdAt: new Date().toISOString(),
      projectRef,
      tablas: tablas.length,
      filas: totalFilas,
      respaldadasAntes: tablas.length - nuevas.length,
      sinPrecedente: nuevas.map((t) => t.full),
      plan,
    };
    writeFileSync(resolve(outDir, "plan.json"), `${JSON.stringify(resumen, null, 2)}\n`, "utf8");
    console.log(`[db-backup --plan] ${tablas.length} tablas · ${totalFilas} filas · ${nuevas.length} sin respaldar hasta ahora`);
    console.log(`[db-backup --plan] evidencia en ${resolve(outDir, "plan.json")}`);
    return;
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    projectRef,
    cobertura: {
      tablas: tablas.length,
      resueltasDesde: "catálogo vivo (pg_class + pg_namespace + pg_attribute)",
      respaldadasAntes: tablas.length - nuevas.length,
      sinPrecedente: nuevas.map((t) => t.full),
    },
    contenido:
      "Texto plano SIN CIFRAR: correos, matrículas, respuestas de quiz, hashes y sales de PIN, y cuerpos de mensajes. Va fuera de git, con permiso de acceso restringido; ver docs/RESPALDOS.md.",
    tables: [] as Array<{ table: string; count: number; sha256: string; orderBy: string; ordenDesde: Tabla["ordenDesde"] }>,
  };

  for (const tabla of tablas) {
    const rows = await querySql(
      projectRef,
      token,
      `SELECT row_to_json(r) AS row FROM (SELECT * FROM ${citas(tabla)} ORDER BY ${tabla.orderBy}) r;`,
    );
    const unwrapped = rows.map((entry) => entry.row);
    const content = `${JSON.stringify(unwrapped, null, 2)}\n`;
    const sha256 = createHash("sha256").update(content).digest("hex");
    writeFileSync(resolve(outDir, `${tabla.full}.json`), content, "utf8");
    manifest.tables.push({ table: tabla.full, count: unwrapped.length, sha256, orderBy: tabla.orderBy, ordenDesde: tabla.ordenDesde });
  }

  writeFileSync(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Backup written to ${outDir}`);
  for (const entry of manifest.tables) {
    console.log(`  ${entry.table.padEnd(34)} rows=${String(entry.count).padStart(6)} sha256=${entry.sha256.slice(0, 12)}…`);
  }
  console.log(`  ${manifest.cobertura.tablas} tablas desde el catálogo vivo · ${nuevas.length} respaldadas por primera vez`);
}

await main();
