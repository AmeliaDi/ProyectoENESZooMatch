/**
 * Registro de planes de re-toma publicados (B9.2, ADR-054; la regla 1 es de ADR-052).
 *
 * `minimalRetake` compara dos instantáneas completas del banco, y esa comparación
 * cuesta: necesita el banco *anterior* y sus cargas. Por eso no se hace en runtime.
 * Quien cambia `data/microtest.json` corre el arnés una vez, con el banco viejo
 * sacado de git, y el plan resultante se versiona aquí (`data/retake-plans.json`).
 * La app solo lee: «¿existe un plan para el banco con el que se midió esta fila?».
 *
 * Tres estados que no deben confundirse, porque cada uno trata distinto a la persona:
 * `unstamped` es un perfil anterior al sello y la regla 1 prohíbe invitarlo a
 * re-contestar; `unknown` es un banco viejo sin plan publicado, y ofrecerle algo
 * sería inventarse preguntas; `overCap` es un plan real por encima del presupuesto
 * de 25 preguntas y necesita decisión de producto antes que un quiz.
 */
import { bankVersionOf } from "@/domain/matching/math-stamp";
import type { RetakeLevel } from "./minimal-retake";

/** Un bloque del re-test: la posterior de un factor se estima junta (I9). */
export interface RetakeBlock {
  readonly factor: string;
  readonly items: readonly string[];
}

export interface ShippedRetakePlan {
  /** Versión del banco en que la persona respondió (`params_version` segmento 2). */
  readonly from: string;
  /** Versión del banco vigente al publicar este plan. */
  readonly to: string;
  readonly level: RetakeLevel;
  readonly blocks: readonly RetakeBlock[];
  readonly reask: readonly string[];
  readonly retired: readonly string[];
  readonly reasons: readonly string[];
  /** Más de 25 preguntas: no se ofrece, se decide. */
  readonly overCap: boolean;
}

export interface RetakeRegistry {
  readonly version: string;
  readonly plans: readonly ShippedRetakePlan[];
}

export type RetakeLookup =
  | { readonly status: "plan"; readonly plan: ShippedRetakePlan }
  | { readonly status: "current" }
  | { readonly status: "unstamped" }
  | { readonly status: "unknown"; readonly from: string };

/**
 * El plan aplicable a un perfil guardado, o por qué no lo hay. Nunca se
 * construye a medias: sin `from` exacto y sin `to` vigente la respuesta es
 * «no invitar», no «preguntar lo que sea».
 */
export function lookupRetake(
  registry: RetakeRegistry,
  stored: string | null | undefined,
  currentBank: string,
): RetakeLookup {
  const from = bankVersionOf(stored);
  if (!from) return { status: "unstamped" };
  if (from === currentBank) return { status: "current" };
  const plan = registry.plans.find((p) => p.from === from && p.to === currentBank);
  return plan ? { status: "plan", plan } : { status: "unknown", from };
}

/** Lo que sí puede ponerse frente a la persona: preguntas existentes y dentro del presupuesto. */
export function isAskable(plan: ShippedRetakePlan | null, knownItems: ReadonlySet<string>): boolean {
  if (!plan || plan.overCap || plan.reask.length === 0) return false;
  return plan.reask.every((id) => knownItems.has(id));
}

/** Total de preguntas del plan: la suma de bloques, no `reask.length` a ciegas. */
export function askCount(plan: ShippedRetakePlan): number {
  return plan.blocks.reduce((sum, block) => sum + block.items.length, 0);
}
