/**
 * DOI resolution (hallazgo I1 de la auditoría). La auditoría de los 17
 * constructos encontró citas inventadas en la capa de género: DOIs que parecen
 * reales y no resuelven en ningún registro. Mientras eso era una nota, una ficha
 * podía licenciar una función de puntaje con una cita falsa. Aquí la resolución
 * pasa a ser un artefacto que el pipeline lee: `data/literature/doi-checks.json`.
 *
 * No hay red en este archivo. Las consultas las hace `scripts/literature/handles.mts`
 * contra `https://doi.org/api/handles/`, y todo lo demás son funciones puras que
 * deciden a partir del artefacto — así el gate se puede probar sin conexión.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { z } from "zod";

export const handleStateValues = ["resuelve", "no_resuelve", "sin_comprobar"] as const;
export type HandleState = (typeof handleStateValues)[number];

const checkSchema = z.object({
  doi: z.string(),
  estado: z.enum(handleStateValues),
  /** The HTTP status behind the verdict; `null` when the call never answered. */
  http: z.number().int().nullable(),
  consultado: z.string(),
  via: z.literal("doi.org/api/handles"),
});

export type HandleCheck = z.infer<typeof checkSchema>;

const registrySchema = z.object({
  version: z.string(),
  nota: z.string(),
  checks: z.record(z.string(), checkSchema),
});

export type HandleRegistryFile = z.infer<typeof registrySchema>;

/** Handle registry, keyed by the normalised DOI so `10.1016/X` and `https://doi.org/10.1016/x` agree. */
export type HandleRegistry = Readonly<Record<string, HandleCheck>>;

/**
 * What the registry's answer means. Only 404/410 says "this handle does not
 * exist"; 0 (timeout), 429 and 5xx say nothing, and a gate that treated them as
 * absence would delete real citations because someone rate-limited us.
 */
export function handleState(status: number): HandleState {
  if (status >= 200 && status < 300) return "resuelve";
  if (status === 404 || status === 410) return "no_resuelve";
  return "sin_comprobar";
}

/**
 * Newest verdict wins, with one exception: an unanswered call never overwrites a
 * verdict we already have, so a flaky run cannot launder evidence into "unknown".
 */
export function mergeChecks(registry: HandleRegistry, checks: readonly HandleCheck[]): HandleRegistry {
  const next: Record<string, HandleCheck> = { ...registry };
  for (const check of checks) {
    const previous = next[check.doi];
    if (previous && check.estado === "sin_comprobar" && previous.estado !== "sin_comprobar") continue;
    next[check.doi] = check;
  }
  return next;
}

/**
 * The gate the crawler runs before storing a row: a DOI the registry says does
 * not exist never becomes a record, so it cannot reach the review queue or the
 * export. Rows without a DOI are keyed by id and stay (they come from searches).
 */
export function keepDoi(doi: string | null, registry: HandleRegistry): boolean {
  if (!doi) return true;
  return registry[doi]?.estado !== "no_resuelve";
}

/** Why each cited DOI may not stand: absent handle, or never checked at all. */
export function unresolvedDois(dois: Iterable<string>, registry: HandleRegistry): Array<{ doi: string; motivo: string }> {
  const out: Array<{ doi: string; motivo: string }> = [];
  for (const doi of dois) {
    const check = registry[doi];
    if (!check || check.estado === "sin_comprobar") {
      out.push({ doi, motivo: "no está comprobado en el registro de handles" });
    } else if (check.estado === "no_resuelve") {
      out.push({ doi, motivo: `el registro de handles respondió ${check.http ?? 404}` });
    }
  }
  return out;
}

export function loadRegistry(path: string): HandleRegistry {
  if (!existsSync(path)) return {};
  return registrySchema.parse(JSON.parse(readFileSync(path, "utf8"))).checks;
}

export function saveRegistry(path: string, checks: HandleRegistry, version: string): void {
  const file: HandleRegistryFile = {
    version,
    nota: "Resolución de cada DOI citado, contra https://doi.org/api/handles/<doi>. "
      + "Lo producen scripts/literature/handles.mts (node --no-warnings scripts/literature/handles.mts) "
      + "y lo lee el crawler para no almacenar filas con un handle inexistente (ADR-049).",
    checks: Object.fromEntries(Object.entries(checks).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}
