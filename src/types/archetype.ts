/**
 * ZooMatch — canonical animal + colour catalogue types.
 *
 * The catalogue in `data/arquetipos.json` defines every possible identity
 * combination used by the quiz result (103 animals × 55 colours).
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

/** Shape families understood by the deterministic sprite engine. */
export type SpriteFamilyId =
  | "felino"
  | "canino"
  | "ave"
  | "roedor"
  | "reptil"
  | "anfibio"
  | "acuatico"
  | "insecto"
  | "ungulado"
  | "oso"
  | "marino"
  | "exotico";

/** The thirteen morphological families used by the expanded catalogue. */
export type MorphologicalFamily =
  | "insectos_aracnidos"
  | "aves"
  | "anfibios"
  | "reptiles"
  | "roedores_herbivoros"
  | "felinos"
  | "caninos"
  | "osos"
  | "ungulados"
  | "vida_marina"
  | "mamiferos_menores"
  | "criaturas_misticas"
  | "criaturas_australes";

/**
 * Big Five vector in OCEAN order: apertura, responsabilidad, extraversión,
 * amabilidad, estabilidad emocional. Every component is normalized to [0, 1].
 */
export type BigFiveVector = readonly [number, number, number, number, number];

export interface ArchetypeNarrativeTemplates {
  /** Who this archetype is, in warm second person. */
  esencia: string;
  /** How this archetype connects with someone else. */
  vinculo: string;
  /** A gentle point of self-care. */
  cuidado: string;
}

/** Kawaii visual traits consumed by the dev gallery and future sprite variants. */
export interface ArchetypeKawaiiTraits {
  /** Iconic ear / crest shape for the species. */
  forma_orejas: string;
  /** The blush pixel is mandatory; this is always true. */
  tiene_rubor: true;
  /** Blush colour, `#FFAAA6` or `#FFB6C1`. */
  color_rubor: string;
  /** Short description of a unique visual detail. */
  detalle_unico: string;
}

/** The four user-selectable inclusive narrative voices. */
export interface ArchetypeInclusiveNarrative {
  masculino: string;
  femenino: string;
  neutro_e: string;
  neutro_universal: string;
}

export interface ArchetypeAnimal {
  id: string;
  /** Friendly Spanish display name, e.g. "Abejita gordita". */
  nombre: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: FaunaCategory;
  familia_morfologica: MorphologicalFamily;
  familia_morfologica_label: string;
  /** Silhouette family used by the deterministic sprite engine. */
  familia_sprite: SpriteFamilyId;
  /** OCEAN order: [apertura, responsabilidad, extraversión, amabilidad, estabilidad]. */
  vector_big_five: BigFiveVector;
  personality_affinity: Record<string, number>;
  /** Highest-affinity MBTI code for this OCEAN profile. */
  mbti_primario: MbtiCode;
  /** Second-highest-affinity MBTI code. */
  mbti_secundario: MbtiCode;
  /** MBTI affinity in [0, 1] for all sixteen codes. */
  mbti_afinidad: Record<MbtiCode, number>;
  /** Three traits derived from the strongest Big Five deviations. */
  rasgos_personalidad: string[];
  plantillas_narrativas: ArchetypeNarrativeTemplates;
  rasgos_kawaii: ArchetypeKawaiiTraits;
  narrativa: ArchetypeInclusiveNarrative;
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
