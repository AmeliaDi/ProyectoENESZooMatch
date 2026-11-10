/**
 * Guard del propio catálogo de invariantes: una suite que cita archivos
 * inexistentes da verde en falso, así que aquí se verifica que cada entrada
 * apunte a pruebas reales y que ningún invariante vinculante falte.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INVARIANT_SUITE, SECRETS_SCRIPT, suiteFiles } from "./invariants";

const ROOT = join(__dirname, "..", "..");

describe("catálogo de invariantes", () => {
  it("cita solo archivos que existen", () => {
    for (const check of INVARIANT_SUITE) {
      expect(check.files.length, check.id).toBeGreaterThan(0);
      for (const file of check.files) {
        expect(existsSync(join(ROOT, file)), `${check.id} → ${file}`).toBe(true);
        expect(file, `${check.id}: deben ser pruebas vitest`).toMatch(/\.test\.ts$/);
      }
    }
  });

  it("tiene ids únicos", () => {
    const ids = INVARIANT_SUITE.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cubre I1–I10 (I8 por script) y S1–S4", () => {
    const ids = new Set(INVARIANT_SUITE.map((check) => check.id));
    for (const id of ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I9", "I10", "S1", "S2", "S3", "S4"]) {
      expect(ids.has(id), `falta ${id}`).toBe(true);
    }
    expect(existsSync(join(ROOT, SECRETS_SCRIPT)), "I8").toBe(true);
  });

  it("describe cada regla en español, no como placeholder", () => {
    for (const check of INVARIANT_SUITE) {
      expect(check.rule.length, check.id).toBeGreaterThan(20);
      expect(check.rule, check.id).not.toMatch(/\bTODO\b|placeholder|pendiente de escribir/);
    }
  });

  it("suiteFiles es la unión deduplicada y ordenada", () => {
    const union = INVARIANT_SUITE.flatMap((check) => [...check.files]);
    const files = suiteFiles();
    expect(files).toEqual([...new Set(union)].sort());
    expect(files.length).toBeLessThan(union.length);
  });
});