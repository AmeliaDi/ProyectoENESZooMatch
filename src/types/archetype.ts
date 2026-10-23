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

export interface ArchetypeColor {
  nombre: string;
  hex: `#${string}`;
}

export interface Archetype {
  id: string;
  codigo_mbti: MbtiCode;
  sobrenombre: string;
  rol: string;
  rasgos: string[];
  animal: {
    nombre_fuente: string;
    diminutivo_es: string;
  };
  paleta: ArchetypeColor[];
  color_principal: ArchetypeColor;
  combinacion_legible: string;
}

export interface ArchetypeCatalog {
  metadatos: {
    version_esquema: string;
    total_arquetipos: number;
    modo: string;
    fuentes: Record<string, unknown>;
  };
  arquetipos: Archetype[];
}