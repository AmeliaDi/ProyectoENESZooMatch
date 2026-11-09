/**
 * Server-only stamp: reads the real measurement model and the real bank and
 * produces the text that goes into `public.profiles.params_version`. There is
 * deliberately no lock file: the stamp is always computed from the same objects
 * the scorer uses, so it cannot drift from the math that produced a score.
 *
 * `measurementFirm` is the half that invalidates a stored θ, so it lives here
 * (`PSYCHOMETRIC_PARAMS` never ships to the browser). `scoringFirm` is pure and
 * client-safe: the profile view recomputes it from `MATCHING_CONFIG` for the T1
 * banner.
 */
import { QUIZ_ITEMS, QUIZ_VERSION } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import type { MeasurementStampInput, StampItem, StampParams } from "@/domain/matching/math-stamp";
import { paramsVersionOf } from "@/domain/matching/math-stamp";

function stampParams(): StampParams {
  const items: Record<string, { factor: string; clave: number; a: number; b: readonly number[] }> = {};
  for (const [id, item] of Object.entries(PSYCHOMETRIC_PARAMS.items)) {
    items[id] = { factor: item.factor, clave: item.clave, a: item.a, b: item.b };
  }
  return {
    factores: PSYCHOMETRIC_PARAMS.factores,
    covarianza: PSYCHOMETRIC_PARAMS.covarianza_latente.matriz,
    items,
  };
}

function stampBank(): StampItem[] {
  return QUIZ_ITEMS.map((item) => ({
    id: item.id,
    texto: item.texto,
    modulo: item.modulo,
    factor: item.factor || null,
    tipo: item.tipo_respuesta,
    opciones: item.opciones ? [...item.opciones] : null,
    polaridad: item.polaridad ?? null,
    romance: item.track_romance,
    amistad: item.track_amistad,
    filtro_duro: item.filtro_duro,
  }));
}

let input: MeasurementStampInput | null = null;

/** Rebuilt at most once per process: the inputs are frozen bundled data. */
export function measurementInput(): MeasurementStampInput {
  input ??= {
    params: stampParams(),
    bank: stampBank(),
    paramsInputHash: PSYCHOMETRIC_PARAMS.entrada_sha256,
  };
  return input;
}

/** The value written to `profiles.params_version` on every score save. */
export function currentParamsVersion(): string {
  return paramsVersionOf(measurementInput(), {
    params: PSYCHOMETRIC_PARAMS.version,
    bank: QUIZ_VERSION,
  });
}

/**
 * What a stored row means against today's measurement. `stamped: false` is the
 * pre-stamp case: nothing is known to have changed, so only the silent
 * recompute applies and nobody is invited to re-answer. `seal` is what the
 * device compares against to show a notice once per real change.
 */
export function measurementState(stored: string | null): { stamped: boolean; current: boolean; seal: string } {
  const seal = currentParamsVersion();
  if (!stored) return { stamped: false, current: false, seal };
  return { stamped: true, current: stored === seal, seal };
}
