/**
 * Re-toma mínima (B9, ADR-052). `public.quiz_responses` guarda cada respuesta
 * cruda, así que re-estimar a alguien desde lo que ya contestó no cuesta una
 * sola pregunta nueva. Lo que SÍ cuesta re-preguntar es lo que dejó de significar
 * lo mismo: un enunciado reescrito, una lista de opciones cambiada, una
 * polaridad invertida, un factor partido o un factor nuevo. Un cambio de pesos,
 * umbrales o ligaduras no invalida ninguna respuesta.
 *
 * El plan nunca saca a nadie del pool: `rescoreOnly` y `answersUsable` dicen
 * qué se recalcula en silencio; `reask` es opcional para la persona.
 */
import type { StampItem, StampParams } from "@/domain/matching/math-stamp";

/** Tres niveles de cambio, tres costos distintos para la usuaria. */
export type RetakeLevel = "T1" | "T2" | "T3";

export interface RetakePlan {
  readonly level: RetakeLevel;
  /** Ítems a re-preguntar, en el orden en que se presentan. */
  readonly reask: readonly string[];
  /** Los mismos ítems agrupados por factor: el re-test se ofrece por bloque (I9). */
  readonly byFactor: Readonly<Record<string, readonly string[]>>;
  /** Ítems que se recalculan desde respuestas guardadas, sin volver a preguntar. */
  readonly rescoreOnly: readonly string[];
  /** Ítems que ya no existen en el banco. */
  readonly retired: readonly string[];
  /** Factores que no tienen ninguna respuesta guardada usable. */
  readonly newFactors: readonly string[];
  /** Por encima del presupuesto de re-toma (≤ 25 preguntas): necesita decisión de producto. */
  readonly overCap: boolean;
  /** En T3 las respuestas viejas siguen sirviendo para re-estimar; en T2, las intactas. */
  readonly answersUsable: boolean;
  /** Motivos legibles, en el orden de severidad, para el aviso y el ADR. */
  readonly reasons: readonly string[];
}

/** Comparables por índice: la versión anterior del banco y del modelo de medición. */
export interface RetakeSnapshot {
  readonly bank: readonly StampItem[];
  readonly params: StampParams;
  /** Método de estimación o tipo de escala del core: cambiarlos es T3. */
  readonly method: string;
}

const REASK_CAP = 25;

function byId(items: readonly StampItem[]): Map<string, StampItem> {
  return new Map(items.map((i) => [i.id, i]));
}

/** Everything about an item except its parameters: what the person actually answered. */
function answeredShape(item: StampItem): string {
  return JSON.stringify([item.texto, item.modulo, item.factor, item.tipo, item.opciones, item.polaridad, item.filtro_duro]);
}

/**
 * `touched` son los ítems cuyo significado cambió. Un factor que se mueve
 * arrastra a toda su familia: se re-pregunta el bloque completo, no solo el
 * ítem movido, porque la posterior se estima en conjunto (I9).
 */
export function minimalRetake(previous: RetakeSnapshot, current: RetakeSnapshot): RetakePlan {
  const before = byId(previous.bank);
  const after = byId(current.bank);
  const reasons: string[] = [];

  const meaningChanged = new Set<string>();
  const added = new Set<string>();
  const retired: string[] = [];
  for (const [id, item] of after) {
    const old = before.get(id);
    if (!old) added.add(id);
    else if (answeredShape(old) !== answeredShape(item)) meaningChanged.add(id);
  }
  for (const id of before.keys()) if (!after.has(id)) retired.push(id);

  const factorsBefore = new Set(previous.bank.map((i) => i.factor).filter((f): f is string => Boolean(f)));
  const factorsAfter = new Set(current.bank.map((i) => i.factor).filter((f): f is string => Boolean(f)));
  const newFactors = [...factorsAfter].filter((f) => !factorsBefore.has(f)).sort();

  // Un ítem reescrito re-pregunta a toda su familia: la posterior del factor se
  // estima junta y media frase vieja junto a media nueva sale peor medida. Un
  // ítem que solo es NUEVO no arrastra a nadie: lo viejo sigue valiendo.
  const touchedFactors = new Set<string>();
  for (const id of meaningChanged) {
    for (const factor of [after.get(id)?.factor, before.get(id)?.factor]) if (factor) touchedFactors.add(factor);
  }

  const touched = new Set<string>(added);
  for (const id of meaningChanged) touched.add(id);
  for (const item of current.bank) {
    if (item.factor && touchedFactors.has(item.factor)) touched.add(item.id);
  }

  const reask = current.bank.filter((i) => touched.has(i.id)).map((i) => i.id);
  const reaskSet = new Set(reask);
  const rescoreOnly = current.bank.filter((i) => !reaskSet.has(i.id)).map((i) => i.id);

  const parametersMoved = JSON.stringify(previous.params.items) !== JSON.stringify(current.params.items);
  const covarianceMoved =
    previous.params.factores.length !== current.params.factores.length ||
    JSON.stringify(previous.params.covarianza) !== JSON.stringify(current.params.covarianza);
  const methodMoved = previous.method !== current.method;
  const bankMoved = reask.length > 0 || retired.length > 0;

  if (methodMoved) reasons.push(`método de estimación o escala cambió (${previous.method} → ${current.method})`);
  if (covarianceMoved) reasons.push("la covarianza latente R cambió");
  if (bankMoved) {
    reasons.push(
      `${added.size} ítems nuevos, ${meaningChanged.size} reescritos, ${retired.length} retirados${
        newFactors.length > 0 ? `; factores nuevos: ${newFactors.join(", ")}` : ""
      }`,
    );
  }
  if (parametersMoved && !bankMoved && !covarianceMoved && !methodMoved) {
    reasons.push("solo se re-estimaron las cargas del GRM: las respuestas siguen valiendo");
  }
  if (reasons.length === 0) reasons.push("cambio de pesos, umbrales, ligaduras o tolerancias: ninguna respuesta afectada");

  const level: RetakeLevel = methodMoved || covarianceMoved ? "T3" : bankMoved ? "T2" : "T1";

  const grouped = new Map<string, string[]>();
  for (const item of current.bank) {
    if (!reaskSet.has(item.id)) continue;
    const key = item.factor || "(sin factor)";
    grouped.set(key, [...(grouped.get(key) ?? []), item.id]);
  }

  return {
    level,
    reask,
    byFactor: Object.fromEntries([...grouped].sort(([a], [b]) => (a < b ? -1 : 1))),
    rescoreOnly,
    retired: retired.sort(),
    newFactors,
    overCap: reask.length > REASK_CAP,
    answersUsable: level !== "T2" || rescoreOnly.length > 0,
    reasons,
  };
}
