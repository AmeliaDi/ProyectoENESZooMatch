/**
 * ZooMatch — canonical animal + colour catalogue types.
 *
 * The catalogue in `data/arquetipos.json` defines every possible identity
 * combination used by the quiz result (61 animals × 55 colours).
 */

export type MbtiCode =
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

export type FaunaCategory =
  | "anfibio"
  | "mamifero"
  | "ave"
  | "pez"
  | "insecto"
  | "reptil"
  | "crustaceo"
  | "molusco"
  | "equinodermo"
  | "cnidario";

export type ColorTexture =
  | "cristalina"
  | "mate"
  | "sedosa"
  | "metalica"
  | "terrosa"
  | "acuosa"
  | "luminosa"
  | "aterciopelada";

export type ColorTemperature = "frio" | "calido" | "neutro";

export interface ArchetypeAnimal {
  id: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: FaunaCategory;
  personality_affinity: Record<string, number>;
}

export interface ArchetypeColor {
  id: string;
  nombre: string;
  hex: `#${string}`;
  textura: ColorTexture;
  temperatura: ColorTemperature;
}

export interface ArchetypeCatalog {
  metadatos: {
    version: string;
    generado: string;
    total_animales: number;
    total_colores: number;
    total_combinaciones: number;
    script: string;
  };
  animales: ArchetypeAnimal[];
  colores: ArchetypeColor[];
}
