import { z } from "zod";

import type {
  ArchetypeAnimal,
  ArchetypeCatalog,
  ArchetypeColor,
  ColorTemperature,
  ColorTexture,
  FaunaCategory,
  MbtiCode,
  MorphologicalFamily,
  SpriteFamilyId,
} from "@/types/archetype";

import raw from "../../data/arquetipos.json";
import { loadConfig } from "./load";

export const MBTI_CODES = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
] as const satisfies readonly MbtiCode[];

const FAUNA = [
  "anfibio", "mamifero", "ave", "pez", "insecto", "reptil",
  "crustaceo", "molusco", "equinodermo", "cnidario",
] as const satisfies readonly FaunaCategory[];

const MORPHOLOGICAL = [
  "insectos_aracnidos", "aves", "anfibios", "reptiles", "roedores_herbivoros", "felinos",
  "caninos", "osos", "ungulados", "vida_marina", "mamiferos_menores", "criaturas_misticas",
  "criaturas_australes",
] as const satisfies readonly MorphologicalFamily[];

const SPRITE_FAMILIES = [
  "felino", "canino", "ave", "roedor", "reptil", "anfibio", "acuatico", "insecto", "ungulado",
  "oso", "marino", "pinnipedo", "tentaculado", "invertebrado", "crustaceo", "murcielago", "exotico",
] as const satisfies readonly SpriteFamilyId[];

const TEXTURES = [
  "cristalina", "mate", "sedosa", "metalica", "terrosa", "acuosa", "luminosa", "aterciopelada",
] as const satisfies readonly ColorTexture[];

const TEMPERATURES = ["frio", "calido", "neutro"] as const satisfies readonly ColorTemperature[];

const unit = z.number().min(0).max(1);
const text = z.string().min(1);
const hex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .transform((value) => value as `#${string}`);

const animalSchema = z.strictObject({
  // Three legacy ids (e.g. `osito_anteojos`) use `_`; they are also keyed in
  // the sprite overrides and the seed, so the pattern accepts both separators.
  id: z.string().regex(/^[a-z0-9_-]+$/),
  nombre: text,
  nombre_fuente: text,
  diminutivo_es: text,
  categoria_fauna: z.enum(FAUNA),
  familia_morfologica: z.enum(MORPHOLOGICAL),
  familia_morfologica_label: text,
  familia_sprite: z.enum(SPRITE_FAMILIES),
  vector_big_five: z.tuple([unit, unit, unit, unit, unit]),
  personality_affinity: z.record(z.string(), unit),
  mbti_primario: z.enum(MBTI_CODES),
  mbti_secundario: z.enum(MBTI_CODES),
  mbti_afinidad: z.record(z.enum(MBTI_CODES), unit),
  rasgos_personalidad: z.array(text).min(1),
  plantillas_narrativas: z.strictObject({ esencia: text, vinculo: text, cuidado: text }),
  rasgos_kawaii: z.strictObject({
    forma_orejas: text,
    tiene_rubor: z.literal(true),
    color_rubor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    detalle_unico: text,
  }),
  narrativa: z.strictObject({
    masculino: text,
    femenino: text,
    neutro_e: text,
    neutro_universal: text,
  }),
}) satisfies z.ZodType<ArchetypeAnimal>;

const colorSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: text,
  hex,
  textura: z.enum(TEXTURES),
  temperatura: z.enum(TEMPERATURES),
}) satisfies z.ZodType<ArchetypeColor>;

function uniqueIds(entries: readonly { id: string }[]): boolean {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}

const catalogSchema = z
  .strictObject({
    metadatos: z.strictObject({
      version: text,
      generado: text,
      total_animales: z.number().int().positive(),
      total_colores: z.number().int().positive(),
      total_combinaciones: z.number().int().positive(),
      script: text,
    }),
    animales: z.array(animalSchema).nonempty(),
    colores: z.array(colorSchema).nonempty(),
  })
  .refine((c) => uniqueIds(c.animales) && uniqueIds(c.colores), "catalogue ids must be unique")
  .refine(
    (c) =>
      c.metadatos.total_animales === c.animales.length &&
      c.metadatos.total_colores === c.colores.length &&
      c.metadatos.total_combinaciones === c.animales.length * c.colores.length,
    "catalogue metadata counts are out of date",
  );

/** Validated, frozen `data/arquetipos.json`. */
export const CATALOG: Readonly<ArchetypeCatalog> = loadConfig("arquetipos", catalogSchema, raw);
export const CATALOG_ANIMALS: readonly ArchetypeAnimal[] = CATALOG.animales;
export const CATALOG_COLORS: readonly ArchetypeColor[] = CATALOG.colores;
