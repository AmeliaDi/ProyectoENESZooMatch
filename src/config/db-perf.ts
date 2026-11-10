/**
 * Validated query-budget config (`data/db-perf.json`).
 *
 * `npm run db:perf` measures the hot storage paths on a throwaway Postgres and
 * fails when a median exceeds its budget. Every number lives here, annotated
 * with its provenance, exactly like the other data files: a budget that is not
 * in the config is a magic number inside a script.
 */
import { z } from "zod";

import { PARAM_LABELS } from "@/types/matching-config";

import raw from "../../data/db-perf.json";
import { loadConfig } from "./load";

const provenance = { etiqueta: z.enum(PARAM_LABELS), fuente: z.string().min(1) };

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, ...provenance })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const positive = z.number().positive();
const count = z.number().int().min(1);

const budget = z.strictObject({ max_ms: annotated(positive), debe_usar_indice: z.boolean().optional() });

export const dbPerfSchema = z
  .strictObject({
    version: z.string().min(1),
    nota: z.string().min(1),
    poblacion: z.strictObject({
      semilla: annotated(z.number().int().nonnegative()),
      perfiles: annotated(count),
      ratio_eclosionados: annotated(z.number().min(0).max(1)),
      huevos_completos: annotated(z.number().int().nonnegative()),
      bajas: annotated(z.number().int().nonnegative()),
      top_k: annotated(count),
      notificaciones_por_perfil: annotated(count),
      conversaciones_por_perfil: annotated(count),
      mensajes_por_conversacion: annotated(count),
      /** Rondas del rompehielos por conversación sembrada (el límite vigente es 3). */
      rondas_por_conversacion: annotated(count),
      etiqueta_version: z.string().min(1),
    }),
    medicion: z.strictObject({
      repeticiones: annotated(count),
      muestra_hatch: annotated(count),
    }),
    /** Concrete arguments passed to the measured RPCs, so a run is reproducible. */
    entradas: z.strictObject({
      nota: z.string().min(1),
      dashboard: z.strictObject({
        umbral_romance: annotated(positive),
        umbral_amistad: annotated(positive),
        referencia_romance: annotated(positive),
        referencia_amistad: annotated(positive),
        ventana_dias: annotated(count),
      }),
      marcas_de_muestra: z.strictObject({
        perfiles_por_matricula: annotated(z.number().int().nonnegative()),
        get_user_matches: annotated(z.number().int().nonnegative()),
        notify_matches: annotated(z.number().int().nonnegative()),
        hatch_profile_identity: annotated(z.number().int().nonnegative()),
      }),
    }),
    presupuestos: z.strictObject({
      perfiles_por_matricula: budget,
      get_user_matches: budget,
      get_my_notifications: budget,
      mark_notifications_read: budget,
      replace_matches: budget,
      notify_matches: budget,
      get_admin_dashboard: budget,
      hatch_profile_identity: budget,
      get_pool_version: budget,
      mensajes_de_conversacion: budget,
    }),
  })
  .superRefine((cfg, ctx) => {
    const pool = cfg.poblacion;
    if (pool.bajas > pool.perfiles) {
      ctx.addIssue({ code: "custom", message: "poblacion.bajas must not exceed poblacion.perfiles" });
    }
    if (pool.top_k >= pool.perfiles * pool.ratio_eclosionados) {
      ctx.addIssue({
        code: "custom",
        message: "poblacion.top_k must be smaller than the hatched pool: a top-k wider than the pool measures clipping, not matching",
      });
    }
    if (cfg.poblacion.ratio_eclosionados * cfg.poblacion.perfiles < 2) {
      ctx.addIssue({
        code: "custom",
        message: "el pool eclosionado debe tener al menos 2 perfiles: sin pares no hay nada que medir en replace_matches",
      });
    }
    // La siembra tiene que respetar el límite que `db:audit` va a comprobar: si
    // sembrara una cuarta ronda, la auditoría marcaría una violación inventada
    // por los datos de prueba y no un defecto real.
    if (cfg.poblacion.rondas_por_conversacion > 3) {
      ctx.addIssue({
        code: "custom",
        message: "poblacion.rondas_por_conversacion no puede pasar de 3: el rompehielos mide exactamente tres preguntas",
      });
    }
    // Una muestra que apunta fuera de su estrato mide otro camino: get_user_matches
    // sobre un huevo no tiene pares, y eclosionar un eclosionado devuelve el alias
    // guardado sin trabajar. Las dos muestras se validan contra su propio rango.
    const hatched = Math.round(cfg.poblacion.perfiles * cfg.poblacion.ratio_eclosionados);
    if (hatched + cfg.poblacion.huevos_completos > cfg.poblacion.perfiles) {
      ctx.addIssue({
        code: "custom",
        message: "huevos_completos + eclosionados no puede exceder perfiles: la siembra no tendría huevos que eclosionar",
      });
    }
    const marcas = cfg.entradas.marcas_de_muestra;
    if (marcas.get_user_matches >= hatched) {
      ctx.addIssue({
        code: "custom",
        message: `entradas.marcas_de_muestra.get_user_matches (${marcas.get_user_matches}) debe ser un perfil eclosionado (< ${hatched}): un huevo no tiene pares que leer`,
      });
    }
    if (marcas.hatch_profile_identity < hatched || marcas.hatch_profile_identity >= cfg.poblacion.perfiles) {
      ctx.addIssue({
        code: "custom",
        message: `entradas.marcas_de_muestra.hatch_profile_identity (${marcas.hatch_profile_identity}) debe caer en el rango de huevos [${hatched}, ${cfg.poblacion.perfiles})`,
      });
    }
    if (cfg.medicion.muestra_hatch > cfg.poblacion.perfiles - hatched) {
      ctx.addIssue({
        code: "custom",
        message: "medicion.muestra_hatch no puede ser mayor que la cantidad de huevos disponibles",
      });
    }
  })
  .transform((cfg) => {
    const { nota: _nota, version: _version, ...rest } = cfg;
    const { nota: _entradasNota, ...entradas } = cfg.entradas;
    return { ...rest, entradas };
  });

export type DbPerf = Readonly<z.output<typeof dbPerfSchema>>;

/** Validated, frozen `data/db-perf.json`. */
export const DB_PERF: DbPerf = loadConfig("db-perf", dbPerfSchema, raw);
