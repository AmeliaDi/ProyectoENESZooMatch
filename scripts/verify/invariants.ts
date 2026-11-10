/**
 * Curated invariant suite (Fase 9). Each entry maps a binding invariant to the
 * EXISTING tests that enforce it — nothing is duplicated here. `verify:invariants`
 * runs the union of these files plus the order-independence probe, so a green
 * run is evidence for the whole contract, not a re-implementation of it.
 *
 * I1–I10 come from PROMPT_AFINACION_ZOOMATCH.md; S1–S4 are the structural
 * invariants the QA prompt demands (symmetry, no stuck eggs, conservation,
 * synthetic isolation). I8 is enforced by `scripts/secrets-check.mts`, which the
 * runner invokes separately because it is not a vitest file.
 */
export interface InvariantCheck {
  readonly id: string;
  readonly rule: string;
  readonly files: readonly string[];
}

export const INVARIANT_SUITE: readonly InvariantCheck[] = [
  {
    id: "I1",
    rule: "Ningún DOI entra al registro sin resolver el handle en doi.org",
    files: ["scripts/literature/lib/handles.test.ts"],
  },
  {
    id: "I2",
    rule: "Selección ≠ predicción: el copy de explicación no promete resultados",
    files: ["src/config/explanation-copy.test.ts", "src/domain/explainability/layered.test.ts"],
  },
  {
    id: "I3",
    rule: "Nada de una pareja existente se mide antes de conocerse",
    files: ["src/application/privacy.test.ts"],
  },
  {
    id: "I4",
    rule: "soc_politica / val_espiritualidad / act_igualdad nunca entran al puntaje",
    files: ["src/config/item-bank.test.ts", "src/config/config.test.ts"],
  },
  {
    id: "I5",
    rule: "Ningún factor pesado se mide con un solo ítem; banda de ruido 0.0440",
    files: ["src/domain/psychometrics/single-item-sensitivity.test.ts"],
  },
  {
    id: "I6",
    rule: "Todo cambio de peso/umbral viaja con sello y hash registrado",
    files: ["src/domain/matching/math-stamp.test.ts", "src/config/traceability.test.ts"],
  },
  {
    id: "I7",
    rule: "El arte de sprites y la paleta pixel no se tocan",
    files: ["src/domain/avatars/pixel-sprites.test.ts", "src/ui/design/design.test.ts"],
  },
  {
    id: "I9",
    rule: "El quiz es la unidad de entrega: ningún bloque parte una familia de puntaje",
    files: ["src/config/retake-plans.test.ts", "src/ui/quiz/quiz-flow.test.ts", "src/config/quiz-catalogue.test.ts"],
  },
  {
    id: "I10",
    rule: "Público maduro: guardarraíles del set +18 sin infantilizar",
    files: ["src/config/quiz-picante-linter.test.ts"],
  },
  {
    id: "S1",
    rule: "Simetría, orden canónico, sin duplicados ni auto-match en lo publicado",
    files: ["src/domain/matching/matching.test.ts", "src/domain/matching/engine.test.ts", "src/domain/matching/rollout.test.ts"],
  },
  {
    id: "S2",
    rule: "Ningún huevo elegible queda atorado; la eclosión es idempotente",
    files: ["src/application/reconcile-eggs.test.ts", "src/application/hatch.test.ts"],
  },
  {
    id: "S3",
    rule: "Conservación: una conversación abierta nunca se pierde por un recálculo",
    files: ["src/domain/matching/rollout.test.ts", "src/infrastructure/supabase/schema.test.ts"],
  },
  {
    id: "S4",
    rule: "QA no manda etiquetas que la API rechaza y solo usa el rango sintético reservado",
    files: ["scripts/verify/synthetic-isolation.test.ts"],
  },
];

/** I8 is a script, not a vitest file; the runner invokes it directly. */
export const SECRETS_SCRIPT = "scripts/secrets-check.mts";

/** Union of every test file the suite cites, deduplicated and sorted. */
export function suiteFiles(): string[] {
  return [...new Set(INVARIANT_SUITE.flatMap((check) => [...check.files]))].sort();
}