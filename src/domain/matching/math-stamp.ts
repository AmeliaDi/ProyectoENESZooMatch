/**
 * Sellos de la matemática (B9, ADR-052). Dos firmas, dos preguntas distintas:
 *
 * - `measurementFirm` — banco de ítems y modelo de medición. Es lo que vuelve
 *   **incomparable un `latent_profile` guardado**: si cambió un enunciado, una
 *   carga `a`/`b`, una polaridad o la covarianza latente, la θ archivada ya no
 *   significa lo mismo. Viaja en `public.profiles.params_version`.
 * - `scoringFirm` — pesos, pisos, umbrales, ligaduras, tolerancias, `combine`.
 *   No invalida ninguna respuesta: el puntaje se recalcula sobre lo guardado, y
 *   por eso su cambio es un aviso (T1), no una re-toma.
 *
 * Las versiones legibles van dentro del sello para que un `SELECT` en crudo se
 * lea sin manual. Las firmas son SHA-256 puro (`domain/shared/hash`) sobre un
 * JSON canónico de llaves ordenadas: reordenar un archivo no mueve la firma,
 * cambiar un número que la persona nota sí.
 */
import { sha256Bytes } from "@/domain/shared/hash";
import type { MatchingConfig } from "@/types/matching-config";

/** Subset of the estimated measurement model that moves a score. */
export interface StampParams {
  readonly factores: readonly string[];
  readonly covarianza: readonly (readonly number[])[];
  readonly items: Readonly<Record<string, { factor: string; clave: number; a: number; b: readonly number[] }>>;
}

/** Everything about an item that the person would notice changing. */
export interface StampItem {
  readonly id: string;
  readonly texto: string;
  readonly modulo: string;
  readonly factor: string | null;
  readonly tipo: string;
  readonly opciones: readonly string[] | null;
  readonly polaridad: string | null;
  readonly romance: boolean;
  readonly amistad: boolean;
  readonly filtro_duro: boolean;
}

export interface MeasurementStampInput {
  readonly params: StampParams;
  readonly bank: readonly StampItem[];
  /** `data/psychometric-params.json:entrada_sha256`: el hash de la corrida generadora. */
  readonly paramsInputHash: string;
}

export interface StampVersions {
  readonly params: string;
  readonly bank: string;
}

/** JSON with sorted object keys, so file order never moves a firm. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

function hex12(text: string): string {
  const bytes = sha256Bytes(new TextEncoder().encode(text));
  let out = "";
  for (const byte of bytes.subarray(0, 6)) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function measurementFirm(input: MeasurementStampInput): string {
  return hex12(
    canonical({
      entrada_sha256: input.paramsInputHash,
      factores: input.params.factores,
      covarianza: input.params.covarianza,
      items: Object.fromEntries(
        Object.entries(input.params.items).map(([id, item]) => [id, { factor: item.factor, clave: item.clave, a: item.a, b: item.b }]),
      ),
      banco: [...input.bank]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((i) => ({
          id: i.id,
          texto: i.texto,
          modulo: i.modulo,
          factor: i.factor,
          tipo: i.tipo,
          opciones: i.opciones,
          polaridad: i.polaridad,
          romance: i.romance,
          amistad: i.amistad,
          filtro: i.filtro_duro,
        })),
    }),
  );
}

/**
 * Lo que entra aquí es todo lo que un par ve cambiar: pesos por pista, pisos,
 * umbral y techo, ancho de kernel, tolerancias y forma de combinar, filtros
 * duros por pista, el β del soft-min y los supuestos de confianza. Se excluye
 * `calibration` (semilla y tamaño de la corrida offline): no cambia ningún
 * número que se publique.
 */
export function scoringFirm(config: MatchingConfig): string {
  return hex12(
    canonical({
      scoring: config.scoring,
      quality: config.quality,
      categories: config.categories,
      tail_groups: config.tail_groups,
      group: config.group,
      badges: config.badges,
      tracks: config.tracks,
      explainability: config.explainability,
    }),
  );
}

/** El texto que se guarda en `profiles.params_version`. */
export function paramsVersionOf(input: MeasurementStampInput, versions: StampVersions): string {
  return `${versions.params}+${versions.bank}+${measurementFirm(input)}`;
}

/** ¿Esta fila se calculó bajo la medición vigente? `null` = anterior al sello. */
export function isCurrentStamp(stored: string | null | undefined, current: string): boolean {
  return stored === current;
}

/** La firma legible dentro de un sello de medición (`…+…<12 hex>`). */
export function firmOf(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  const last = stamp.split("+").pop() ?? "";
  return /^[0-9a-f]{12}$/.test(last) ? last : null;
}
