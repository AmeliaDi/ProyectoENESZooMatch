/**
 * Base Postgres desechable en memoria (PGlite, WASM) para probar migraciones y
 * comportamiento SQL sin Docker, sin psql y sin tocar producción.
 *
 * Solo aquí se carga scripts/db/supabase-shim.sql. La base nace vacía en cada
 * `openLocal()` y se destruye al cerrar: no hay estado entre corridas.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import { OPTIONAL_QUERIES, QUERIES } from "./catalog.mjs";
import { root } from "./lib.mjs";
import { pgArray } from "./schema-doc.mjs";

export const MIGRATIONS_DIR = "supabase/migrations";
export const BASE_MIGRATION = "00000000000000_base.sql";
export const SEED_FILE = "supabase/seed.sql";

/** Orden lexicográfico = orden cronológico: los nombres llevan timestamp. */
export function migrationFiles() {
  return readdirSync(resolve(root, MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export const readSql = (relative) => readFileSync(resolve(root, relative), "utf8");

/** Una migración se declara idempotente en su encabezado (misma regla que db-apply). */
export function declaresIdempotent(sql) {
  return /idempotent/i.test(sql.slice(0, 2000));
}

export async function openLocal() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(readSql("scripts/db/supabase-shim.sql"));
  return {
    db,
    close: () => db.close(),
    /** Ejecuta un archivo y devuelve el error tal cual, sin tragárselo. */
    async apply(relative) {
      const started = Date.now();
      try {
        await db.exec(readSql(relative));
        return { file: relative, ok: true, elapsedMs: Date.now() - started };
      } catch (error) {
        // Un archivo con BEGIN que falla deja la sesión en transacción abortada;
        // sin esto, el siguiente archivo reportaría el error del anterior.
        await db.exec("ROLLBACK;").catch(() => {});
        return { file: relative, ok: false, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * Catálogo local con las MISMAS consultas que db:schema usa contra producción,
 * para que la comparación sea entre objetos idénticos y no entre dos criterio.
 */
export async function localCatalog(db) {
  const catalog = { unavailable: {} };
  for (const [key, sql] of Object.entries(QUERIES)) {
    catalog[key] = (await db.query(sql)).rows;
  }
  for (const [key, sql] of Object.entries(OPTIONAL_QUERIES)) {
    try {
      catalog[key] = (await db.query(sql)).rows;
    } catch {
      catalog[key] = [];
      catalog.unavailable[key] = "extensión ausente en la base local (esperado)";
    }
  }
  for (const publication of catalog.publications) publication.tables = pgArray(publication.tables);
  for (const policy of catalog.policies) policy.roles = pgArray(policy.roles);
  return catalog;
}

/** Identidad de sesión: los RPC leen auth.jwt()/auth.uid() de estos GUC. */
export async function setSession(db, { userId = null, role = "service_role" } = {}) {
  const claims = JSON.stringify({ role, sub: userId });
  await db.exec(`SET request.jwt.claims = '${claims.replace(/'/g, "''")}';`);
  await db.exec(`SET request.jwt.claim.sub = '${userId ?? ""}';`);
  await db.exec(`SET request.jwt.claim.role = '${role}';`);
  await db.exec(`SET ROLE ${role};`);
}

export async function resetSession(db) {
  await db.exec("RESET ROLE; RESET request.jwt.claims; RESET request.jwt.claim.sub; RESET request.jwt.claim.role;");
}

export const migrationPath = (name) => join(MIGRATIONS_DIR, name).replaceAll("\\", "/");