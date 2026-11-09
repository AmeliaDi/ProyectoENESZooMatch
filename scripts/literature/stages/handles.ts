/**
 * Stage 0 (free, no credits): resolve every DOI the project cites against the
 * handle registry and write the verdicts to `data/literature/doi-checks.json`.
 *
 * This is what makes the citation claim checkable. Before it, "verificada en
 * Crossref" only existed inside a note, and `docs/DECISIONES.md` recorded that
 * five citations of one layer had been invented — a check nobody could re-run.
 * The crawler reads the artifact (`keepDoi`) so a handle that answers 404 never
 * becomes a row, and `handles.test.ts` reads it so no card can license a
 * function of scoring with a DOI that does not resolve.
 */
import { checkHandle } from "../clients/doi-org.ts";
import { handleStateValues, type HandleCheck, type HandleState } from "../lib/handles.ts";
import type { HttpClient } from "../lib/http.ts";

export interface HandleStageResult {
  readonly checks: readonly HandleCheck[];
  readonly porEstado: Readonly<Record<HandleState, number>>;
}

/**
 * Sequential on purpose: `HttpClient` throttles per source (300 ms for doi.org)
 * and the registry is a public service, not a search engine. A DOI that errors
 * yields `sin_comprobar`, never `no_resuelve`.
 */
export async function resolveDois(
  http: HttpClient,
  dois: readonly string[],
  ahora: () => string = () => new Date().toISOString(),
): Promise<HandleStageResult> {
  const checks: HandleCheck[] = [];
  for (const doi of [...new Set(dois)].sort((a, b) => a.localeCompare(b))) {
    checks.push(await checkHandle(http, doi, ahora()));
  }
  const porEstado = Object.fromEntries(handleStateValues.map((s) => [s, 0])) as Record<HandleState, number>;
  for (const check of checks) porEstado[check.estado] += 1;
  return { checks, porEstado };
}
