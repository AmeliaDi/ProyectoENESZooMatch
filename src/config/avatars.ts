import { z } from "zod";

import raw from "../../data/avatar-config.json";
import { CATALOG_ANIMALS, MBTI_CODES } from "./catalog";
import { loadConfig } from "./load";

const label = z.enum(["prior_literatura", "estimado_sintetico", "supuesto_diseno", "pendiente_verificacion"]);
const annotated = <T extends z.ZodType>(value: T) =>
  z.strictObject({ valor: value, etiqueta: label, fuente: z.string().min(1) });
const glyph = z.strictObject({ id: z.string().min(1), nombre: z.string().min(1), razon: z.string().min(1) });
const TYPE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "neutro"] as const;

const ANIMAL_IDS = new Set(CATALOG_ANIMALS.map((a) => a.id));

const avatarSchema = z
  .strictObject({
    version: z.string().min(1),
    nota: z.string().min(1),
    species_pools: z.strictObject({
      etiqueta: label,
      fuente: z.string().min(1),
      pools: z.record(z.enum(MBTI_CODES), z.array(z.string()).min(1)),
    }),
    species_clarity_cuts: z.strictObject({
      valores: z.record(z.string().regex(/^[1-9]$/), z.array(z.number().min(0).max(1))),
      etiqueta: label,
      fuente: z.string().min(1),
    }),
    ambiguity: z.strictObject({
      wing_margin: annotated(z.number().min(0).max(1)),
      subtype_max_se: annotated(z.number().positive().max(1)),
      subtype_margin: annotated(z.number().min(0)),
      neblina_prior_weight: annotated(z.number().positive().max(0.2)),
      max_color_share: annotated(z.number().positive().max(0.5)),
      min_color_entropy: annotated(z.number().positive()),
    }),
    emblem_tone: annotated(z.string().regex(/^#[0-9A-F]{6}$/)),
    emblems: z.record(z.enum(TYPE_KEYS), glyph),
    subtypes: z.strictObject({ sp: glyph, so: glyph, sx: glyph }),
    identity: z.strictObject({
      suffix_alphabet: annotated(z.string().regex(/^[BCDFGHJKLMNPQRSTVWXYZ]+$/)),
      suffix_length: annotated(z.number().int().min(4).max(8)),
      separator: annotated(z.string().min(1).max(5)),
      max_alias_length: annotated(z.number().int().min(32).max(128)),
      max_collision_attempts: annotated(z.number().int().min(8).max(256)),
      blocked_suffixes: annotated(z.array(z.string().regex(/^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/))),
      egg_crack_stages: annotated(z.number().int().min(1).max(8)),
    }),
  })
  .refine((c) => MBTI_CODES.every((code) => (c.species_pools.pools[code]?.length ?? 0) > 0), "every MBTI code needs a pool")
  .refine((c) => {
    const all = Object.values(c.species_pools.pools).flat();
    return all.every((id) => ANIMAL_IDS.has(id)) && new Set(all).size === all.length;
  }, "pools must use catalogue ids, each at most once")
  .refine((c) => TYPE_KEYS.every((k) => c.emblems[k] !== undefined), "emblems need types 1-9 and neutro")
  .refine(
    (c) =>
      Object.values(c.species_pools.pools).every((pool) => {
        const cuts = c.species_clarity_cuts.valores[String(pool.length)];
        return pool.length === 1 || (cuts?.length === pool.length - 1 && cuts.every((v, i) => i === 0 || v > cuts[i - 1]!));
      }),
    "every pool size needs n−1 increasing clarity cuts",
  );

export type AvatarConfig = z.output<typeof avatarSchema>;

/** Validated, frozen `data/avatar-config.json`. */
export const AVATAR_CONFIG: Readonly<AvatarConfig> = loadConfig("avatar-config", avatarSchema, raw);
