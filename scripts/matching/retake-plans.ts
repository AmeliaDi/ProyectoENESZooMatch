/**
 * Arnés de planes de re-toma (B9.2, ADR-054).
 *
 * `minimalRetake` necesita dos instantáneas completas del banco —la de antes y la
 * de hoy— y la de antes ya no está en el árbol: está en git. Este arnés la saca
 * con `git show`, calcula el plan y lo publica en `data/retake-plans.json` para
 * que la app solo tenga que mirar la tabla: «¿hay plan para el banco con el que
 * se midió esta fila?». Nada de esto corre en runtime: comparar 197 enunciados
 * por cada perfil sería pagar dos veces por lo mismo.
 *
 * Un plan por cada versión de banco que exista en el historial, siempre hacia la
 * vigente. Si el diff no es comparable (factores partido, método nuevo) el plan
 * sale T3 con `overCap`, y la app lo lee como «no invites a nadie»: es un dato,
 * no una excepción.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { StampItem, StampParams } from "@/domain/matching/math-stamp";
import { minimalRetake, type RetakeSnapshot } from "@/domain/psychometrics/minimal-retake";
import type { RetakeRegistry, ShippedRetakePlan } from "@/domain/psychometrics/retake-registry";

const BANK_PATH = "data/microtest.json";
const PARAMS_PATH = "data/psychometric-params.json";
const OUT_PATH = "data/retake-plans.json";

/** Registry published by this harness; the app reads it and never recomputes. */
export const PLANS_VERSION = "retake-plans-1";

interface RawItem {
  id?: unknown;
  texto?: unknown;
  modulo?: unknown;
  factor?: unknown;
  tipo_respuesta?: unknown;
  opciones?: unknown;
  polaridad?: unknown;
  track_romance?: unknown;
  track_amistad?: unknown;
  filtro_duro?: unknown;
}

interface RawBank {
  metadatos: { version?: unknown };
  items?: unknown;
}

interface RawParams {
  version?: unknown;
  generado_por?: unknown;
  factores?: unknown;
  covarianza_latente?: { matriz?: unknown };
  items?: unknown;
}

/** Un banco viejo puede traer campos ausentes: el plan no debe romperse por eso. */
function stampItem(raw: RawItem): StampItem {
  return {
    id: String(raw.id ?? ""),
    texto: String(raw.texto ?? ""),
    modulo: String(raw.modulo ?? ""),
    factor: raw.factor ? String(raw.factor) : null,
    tipo: String(raw.tipo_respuesta ?? ""),
    opciones: Array.isArray(raw.opciones) ? raw.opciones.map(String) : null,
    polaridad: raw.polaridad ? String(raw.polaridad) : null,
    romance: raw.track_romance === true,
    amistad: raw.track_amistad === true,
    filtro_duro: raw.filtro_duro === true,
  };
}

function stampParams(raw: RawParams): StampParams {
  const items: Record<string, { factor: string; clave: number; a: number; b: readonly number[] }> = {};
  for (const [id, item] of Object.entries((raw.items ?? {}) as Record<string, { factor?: unknown; clave?: unknown; a?: unknown; b?: unknown }>)) {
    items[id] = {
      factor: String(item.factor ?? ""),
      clave: Number(item.clave ?? 1),
      a: Number(item.a ?? 0),
      b: Array.isArray(item.b) ? item.b.map(Number) : [],
    };
  }
  return {
    factores: Array.isArray(raw.factores) ? raw.factores.map(String) : [],
    covarianza: Array.isArray(raw.covarianza_latente?.matriz) ? (raw.covarianza_latente?.matriz as number[][]).map((row) => row.map(Number)) : [],
    items,
  };
}

interface Snapshot {
  readonly version: string;
  readonly snapshot: RetakeSnapshot;
}

/**
 * `method` es lo que nombra al estimador: la versión del archivo de parámetros y
 * el script que lo generó. Cambiarlos (o partir un factor) es T3 porque la θ
 * archivada deja de estar en la misma escala, no porque alguien reescribió una
 * frase.
 */
function snapshotOf(bank: RawBank, params: RawParams): Snapshot {
  const items = Array.isArray(bank.items) ? (bank.items as RawItem[]).map(stampItem) : [];
  return {
    version: String(bank.metadatos?.version ?? ""),
    snapshot: {
      bank: items,
      params: stampParams(params),
      method: `${String(params.version ?? "")}+${String(params.generado_por ?? "")}`,
    },
  };
}

function gitJson<T>(root: string, ref: string, path: string): T {
  // A banco viejo sin `data/psychometric-params.json` no hay plan posible: el
  // git muestra su error en stderr y el llamador pasa a la siguiente versión.
  const text = execFileSync("git", ["show", `${ref}:${path}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
}

function fileJson<T>(root: string, path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8").replace(/^\uFEFF/, "")) as T;
}

/** Commits that touched the bank, newest first — the only history a plan needs. */
function bankHistory(root: string): string[] {
  return execFileSync("git", ["log", "--format=%h", "--", BANK_PATH], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function planOf(from: Snapshot, to: Snapshot): ShippedRetakePlan {
  const plan = minimalRetake(from.snapshot, to.snapshot);
  return {
    from: from.version,
    to: to.version,
    level: plan.level,
    blocks: Object.entries(plan.byFactor).map(([factor, items]) => ({ factor, items })),
    reask: plan.reask,
    retired: plan.retired,
    reasons: plan.reasons,
    overCap: plan.overCap,
  };
}

/** One plan per bank version, always toward the version in the working tree. */
export function buildRegistry(root: string): RetakeRegistry {
  const current = snapshotOf(fileJson<RawBank>(root, BANK_PATH), fileJson<RawParams>(root, PARAMS_PATH));
  const seen = new Set<string>([current.version]);
  const plans: ShippedRetakePlan[] = [];
  for (const ref of bankHistory(root)) {
    let older: Snapshot;
    try {
      older = snapshotOf(gitJson<RawBank>(root, ref, BANK_PATH), gitJson<RawParams>(root, ref, PARAMS_PATH));
    } catch {
      continue;
    }
    if (!older.version || seen.has(older.version)) continue;
    seen.add(older.version);
    plans.push(planOf(older, current));
  }
  return { version: PLANS_VERSION, plans: plans.sort((a, b) => (a.from < b.from ? 1 : -1)) };
}

export function main({ root, write }: { root: string; write: boolean }): void {
  const registry = buildRegistry(root);
  const json = `${JSON.stringify(registry, null, 2)}\n`;
  for (const plan of registry.plans) {
    console.log(
      `${plan.from} → ${plan.to}: ${plan.level}, ${plan.reask.length} preguntas en ${plan.blocks.length} bloques` +
        `${plan.retired.length ? `, ${plan.retired.length} retirados` : ""}${plan.overCap ? " (fuera del presupuesto: no se ofrece)" : ""}`,
    );
    console.log(`  ${plan.reasons.join(" · ")}`);
  }
  if (!write) {
    console.log("sin escribir: agrega --write para publicar data/retake-plans.json");
    return;
  }
  writeFileSync(join(root, OUT_PATH), json, "utf8");
  console.log(`escrito ${OUT_PATH} (${registry.plans.length} planes, banco ${registry.plans[0]?.to ?? "?"})`);
}

/** Utilidad de prueba: leer el registro publicado desde el árbol de trabajo. */
export function readPublished(root: string): RetakeRegistry {
  return JSON.parse(readFileSync(join(root, OUT_PATH), "utf8").replace(/^\uFEFF/, "")) as RetakeRegistry;
}
