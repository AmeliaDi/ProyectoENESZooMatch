/**
 * Utilidades compartidas del andamiaje de QA de base de datos.
 *
 * Reglas duras del prompt de QA que aquí se aplican, no se documentan:
 *  - Solo lectura sobre producción. `queryReadOnly` rechaza cualquier verbo de
 *    escritura antes de mandar la consulta, así que un archivo de auditoría mal
 *    editado no puede escribir.
 *  - Nunca se imprime el valor de un secreto: solo si la credencial existe.
 *  - Sin herramienta o sin credencial, el paso se reporta OMITIDO con el motivo
 *    exacto; jamás se inventa un resultado.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../..", import.meta.url));
export const qaDir = resolve(root, ".qa");

const ENV_FILES = [".env.local", ".env.cli"];

function envText() {
  return ENV_FILES.map((file) => (existsSync(resolve(root, file)) ? readFileSync(resolve(root, file), "utf8") : "")).join("\n");
}

/** Devuelve la credencial o null. El valor nunca sale de aquí hacia la consola. */
export function credentials() {
  const text = envText();
  const get = (name) => process.env[name] ?? text.match(new RegExp(`^${name}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"))?.[1]?.trim();
  const url = get("NEXT_PUBLIC_SUPABASE_URL") ?? get("SUPABASE_URL");
  const token = get("SUPABASE_ACCESS_TOKEN");
  const ref = get("SUPABASE_PROJECT_REF") ?? /^https:\/\/([a-z0-9]+)\./.exec(url ?? "")?.[1];
  if (!token || !ref) return null;
  return { ref, token };
}

export function which(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { encoding: "utf8", shell: false });
  return result.status === 0 ? (result.stdout.split(/\r?\n/)[0] ?? null) : null;
}

const WRITE_VERBS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|do|copy|vacuum|reindex|cluster|notify|set|reset|begin|commit|rollback|refresh|prepare|execute|listen|unlisten|discard|lock)\b/i;

/** Quita comentarios y literales para que el guardia no se dispare con texto. */
export function sqlBody(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, " ");
}

export function assertReadOnly(sql) {
  const body = sqlBody(sql);
  const verb = WRITE_VERBS.exec(body);
  if (verb) throw new Error(`consulta de auditoría con verbo de escritura «${verb[1]}»: solo se permite lectura`);
  if (!/\bselect\b|\bwith\b/i.test(body)) throw new Error("la consulta de auditoría no es un SELECT");
}

/**
 * Una sola consulta SELECT contra el proyecto remoto. La API de Management
 * devuelve el último conjunto de filas, así que no se envuelven varias
 * sentencias en una transacción: el guardia de escritura es la protección.
 */
export async function queryReadOnly(sql) {
  assertReadOnly(sql);
  const creds = credentials();
  if (!creds) throw new Error("sin credenciales de Supabase");
  const res = await fetch(`https://api.supabase.com/v1/projects/${creds.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

export function writeReport(name, report) {
  mkdirSync(qaDir, { recursive: true });
  const path = resolve(qaDir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

/** Cierra el paso: 0 si pasó u omitido, 1 si falló. Siempre imprime el motivo. */
export function finish(name, report) {
  const path = writeReport(name, report);
  const mark = report.status === "passed" ? "✓" : report.status === "skipped" ? "—" : "✗";
  console.log(`[${name}] ${mark} ${report.status}${report.reason ? ` · ${report.reason}` : ""}`);
  for (const finding of report.findings ?? []) console.log(`  · ${finding}`);
  console.log(`[${name}] evidencia en .qa/${name}.json (${path})`);
  process.exit(report.status === "failed" ? 1 : 0);
}

export const skipped = (reason, extra = {}) => ({ status: "skipped", reason, generatedAt: new Date().toISOString(), ...extra });
export const passed = (extra = {}) => ({ status: "passed", generatedAt: new Date().toISOString(), ...extra });
export const failed = (reason, extra = {}) => ({ status: "failed", reason, generatedAt: new Date().toISOString(), ...extra });