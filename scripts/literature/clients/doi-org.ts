/**
 * `https://doi.org/api/handles/<doi>` — the handle registry, the only place
 * that answers "does this DOI exist" without spending a Firecrawl credit. It is
 * a plain GET: 200 with the handle values, 404 with an error body.
 *
 * The verdict itself is `lib/handles.ts` (pure, offline); this file only makes
 * the call and reports the status.
 */
import { handleState, type HandleCheck, type HandleState } from "../lib/handles.ts";
import type { HttpClient } from "../lib/http.ts";

const enc = encodeURIComponent;

export interface HandleAnswer {
  readonly estado: HandleState;
  readonly status: number;
}

export async function handleAnswer(http: HttpClient, doi: string): Promise<HandleAnswer> {
  const result = await http.request({
    source: "doi.org",
    endpoint: "api/handles",
    url: `https://doi.org/api/handles/${enc(doi)}`,
    headers: { Accept: "application/json" },
  });
  return { estado: handleState(result.status), status: result.status };
}

/** One check for the registry. `consultado` is injected so a run is reproducible in tests. */
export async function checkHandle(http: HttpClient, doi: string, consultado: string): Promise<HandleCheck> {
  const answer = await handleAnswer(http, doi);
  return { doi, estado: answer.estado, http: answer.status === 0 ? null : answer.status, consultado, via: "doi.org/api/handles" };
}
