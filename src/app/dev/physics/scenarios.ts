/**
 * Escenarios deterministas para `/dev/physics`. Cada uno fija cuántas
 * estrellas hay, cómo se reparten sus afinidades y cómo se relacionan entre
 * sí, para poder comparar métricas entre ajustes con la misma semilla.
 */

import type { PairSimilarity } from "@/domain/constellation";

export type ScenarioId = "pocos" | "denso" | "grupo5" | "cien" | "todos" | "ninguno" | "drag";

export interface Scenario {
  id: ScenarioId;
  label: string;
  nodes: number;
  /** Afinidad mínima y máxima generada (sobre la pista amistad). */
  low: number;
  high: number;
  /** Afinidad entre estrellas; `undefined` usa la estimación por defecto. */
  pair?: PairSimilarity;
  /** Lanza un impulso a todas las estrellas al cargar. */
  kick?: boolean;
}

const GROUP_PREFIX = "grp";

/** Cinco estrellas mutuamente afines; el resto no se lleva entre sí. */
const fiveGroup: PairSimilarity = (a, b) =>
  a.id.startsWith(GROUP_PREFIX) && b.id.startsWith(GROUP_PREFIX) ? 0.95 : 0.4;

const nobodyTogether: PairSimilarity = () => 0.2;
const everyoneTogether: PairSimilarity = () => 0.96;

export const SCENARIOS: readonly Scenario[] = [
  { id: "pocos", label: "Pocos nodos", nodes: 3, low: 0.7, high: 0.95 },
  { id: "denso", label: "Cluster denso", nodes: 24, low: 0.9, high: 0.99 },
  { id: "grupo5", label: "Grupo de 5", nodes: 10, low: 0.75, high: 0.97, pair: fiveGroup },
  { id: "cien", label: "100 nodos", nodes: 100, low: 0.66, high: 0.99 },
  { id: "todos", label: "Todos compatibles", nodes: 16, low: 0.9, high: 0.99, pair: everyoneTogether },
  { id: "ninguno", label: "Ninguno compatible", nodes: 0, low: 0.5, high: 0.6, pair: nobodyTogether },
  { id: "drag", label: "Drag agresivo", nodes: 16, low: 0.7, high: 0.97, kick: true },
];

export { GROUP_PREFIX };
