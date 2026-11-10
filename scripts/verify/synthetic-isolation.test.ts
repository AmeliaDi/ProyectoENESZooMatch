/**
 * S4 — aislamiento de las cuentas sintéticas de QA.
 *
 * No hay base de datos en CI, así que esto vigila el contrato textualmente, igual
 * que src/infrastructure/supabase/schema.test.ts. Lo que SÍ está aplicado: la API
 * de entrada no acepta etiquetas sintéticas (strictObject) y ningún arnés las
 * manda, y todo arnés usa el rango de matrículas reservado. Lo que NO está
 * aplicado y queda registrado como pendiente manual: el observatorio de admin
 * cuenta todos los perfiles, así que una corrida de QA contra producción sí
 * contamina las métricas reales hasta que exista la columna `sintetico`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { enterRequestSchema } from "@/application/validation/common";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

/** Rango reservado para QA; fuera de él un arnés tocaría cuentas reales. */
const RESERVED = { min: 426144890, max: 426144899 } as const;

const QA_DIR = join(ROOT, "scripts/qa");
const HARNESS_FILES = [
  ...readdirSync(QA_DIR)
    .filter((name) => /\.(mjs|ts)$/.test(name))
    .map((name) => `scripts/qa/${name}`),
  "src/app/chat-integration.test.ts",
];

/**
 * Cada llamada a /api/enter y los 260 caracteres que la siguen: suficiente para
 * el cuerpo, tanto en una línea como partido en varias (fetch multi-línea).
 */
function enterPayloads(source: string): string[] {
  return [...source.matchAll(/\/api\/enter/g)].map((m) => source.slice(m.index, m.index + 260));
}

describe("S4 · la API de entrada no tiene superficie de etiquetado sintético", () => {
  it("rechaza eventId", () => {
    const parsed = enterRequestSchema.safeParse({ matricula: "426144890", eventId: "qa-chat" });
    expect(parsed.success).toBe(false);
  });

  it("rechaza la bandera sintetico", () => {
    const parsed = enterRequestSchema.safeParse({ matricula: "426144890", sintetico: true });
    expect(parsed.success).toBe(false);
  });

  it("acepta la matrícula sola, que es la única credencial (ADR-026)", () => {
    expect(enterRequestSchema.safeParse({ matricula: "426144890" }).success).toBe(true);
  });
});

describe("S4 · ningún arnés manda etiquetas que la API rechaza", () => {
  it.each(HARNESS_FILES)("%s no envía eventId ni sintetico a /api/enter", (file) => {
    const payloads = enterPayloads(read(file));
    for (const payload of payloads) {
      expect(payload, `${file}: /api/enter es strictObject, la etiqueta devuelve 400`).not.toMatch(/eventId|sintetico/);
    }
  });

  it("los arneses que antes fallaban sí llaman a /api/enter", () => {
    const fixed = [
      "scripts/qa/qa-chat-setup.mjs",
      "scripts/qa/qa-chat-soak.mjs",
      "scripts/qa/chat-load.mjs",
      "scripts/qa/chat-canary.mjs",
      "scripts/qa/chat-sla.test.ts",
      "scripts/qa/chat-resilience.test.ts",
      "src/app/chat-integration.test.ts",
    ];
    for (const file of fixed) expect(enterPayloads(read(file)).length, file).toBeGreaterThan(0);
  });
});

describe("S4 · las matrículas declaradas por los arneses están en el rango reservado", () => {
  it.each(HARNESS_FILES)("%s no declara matrículas fuera del rango", (file) => {
    const declared = [...read(file).matchAll(/^const (MATRICULA_\w+)\s*=\s*"?(\d{9})"?/gm)];
    for (const [, name, digits] of declared) {
      const value = Number(digits);
      expect(value, `${file}: ${name}`).toBeGreaterThanOrEqual(RESERVED.min);
      expect(value, `${file}: ${name}`).toBeLessThanOrEqual(RESERVED.max);
    }
  });

  it("el rango reservado tiene diez matrículas y nueve dígitos", () => {
    expect(RESERVED.max - RESERVED.min + 1).toBe(10);
    expect(String(RESERVED.min)).toHaveLength(9);
  });
});

describe("S4 · el aislamiento a nivel base de datos queda registrado, no supuesto", () => {
  it("docs/PENDIENTES_MANUALES.md documenta que el observatorio aún cuenta cuentas sintéticas", () => {
    const doc = read("docs/PENDIENTES_MANUALES.md");
    expect(doc).toContain("sintetico");
    expect(doc).toContain("get_admin_dashboard");
    expect(doc).toMatch(/426144890/);
  });
});