import { z } from "zod";

import raw from "../../data/animo-catalog.json" with { type: "json" };
import { loadConfig } from "./load";

export const ANIMO_CATEGORIAS = [
  "momento_del_dia",
  "primera_entrada",
  "contexto_social",
  "animo_publicado",
  "estacional",
  "generico",
] as const;
export type AnimoCategoria = (typeof ANIMO_CATEGORIAS)[number];

export const ANIMO_CONTEXTO_SOCIAL = [
  "match_nuevo",
  "invitacion_chat",
  "sin_matches",
  "despues_de_quiz",
  "tras_eclosion",
  "tras_varios_dias",
] as const;
export type AnimoContextoSocial = (typeof ANIMO_CONTEXTO_SOCIAL)[number];

export const ANIMO_MOMENTO_DIA = ["manana", "tarde", "noche", "madrugada"] as const;
export type AnimoMomentoDia = (typeof ANIMO_MOMENTO_DIA)[number];

export const ANIMO_PRIMERA_ENTRADA = ["tras_eclosion", "del_dia", "tras_varios_dias"] as const;
export type AnimoPrimeraEntrada = (typeof ANIMO_PRIMERA_ENTRADA)[number];

export const ANIMO_ESTACIONAL = [
  "invierno",
  "primavera",
  "verano",
  "otono",
  "dia_muertos",
  "navidad",
  "anio_nuevo",
  "fin_de_anio",
] as const;
export type AnimoEstacional = (typeof ANIMO_ESTACIONAL)[number];

export const ANIMO_PUBLICADO = [
  "cansancio",
  "ansiedad",
  "ganas_de_platicar",
  "necesito_un_abrazo",
  "alegria",
  "concentracion",
] as const;
export type AnimoPublicado = (typeof ANIMO_PUBLICADO)[number];

const fechaMMDD = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "fecha MM-DD válida");

const estacionalRango = z.strictObject({
  inicio: fechaMMDD,
  fin: fechaMMDD,
});

const mensaje = z.strictObject({
  id: z.string().min(1).max(60),
  categoria: z.enum(ANIMO_CATEGORIAS),
  contexto: z.string().min(1).max(40),
  texto: z.string().min(1).max(120),
  placeholders: z.array(z.string().min(0).max(20)).max(5),
  intensidad: z.enum(["suave", "media"]),
  estacional: estacionalRango.nullable(),
});

export const animoCatalogSchema = z.strictObject({
  version: z.string().min(1),
  fuente: z.string().min(1).optional(),
  mensajes: z.array(mensaje).min(1),
});

export type AnimoCatalogDTO = z.infer<typeof animoCatalogSchema>;

const FORBIDDEN_WORDS = [
  "te extrañamos",
  "debes",
  "tienes que",
  "por qué no",
  "deberías",
  "nunca",
  "siempre",
  "obligación",
  "problema",
  "triste",
  "solo",
  "sola",
  "soledad",
];

function validateCatalog(catalog: AnimoCatalogDTO): void {
  const issues: string[] = [];

  // Check for forbidden words
  for (const msg of catalog.mensajes) {
    const lowerText = msg.texto.toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      if (lowerText.includes(word)) {
        issues.push(`Mensaje ${msg.id} contiene palabra prohibida: "${word}"`);
      }
    }
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const msg of catalog.mensajes) {
    if (ids.has(msg.id)) {
      issues.push(`ID duplicado: ${msg.id}`);
    }
    ids.add(msg.id);
  }

  // Check message count
  if (catalog.mensajes.length < 150) {
    issues.push(`Catálogo tiene ${catalog.mensajes.length} mensajes, mínimo requerido: 150`);
  }
  if (catalog.mensajes.length > 200) {
    issues.push(`Catálogo tiene ${catalog.mensajes.length} mensajes, máximo permitido: 200`);
  }

  // Check context distribution
  const contextCounts = new Map<string, number>();
  for (const msg of catalog.mensajes) {
    contextCounts.set(msg.contexto, (contextCounts.get(msg.contexto) ?? 0) + 1);
  }

  // Each context should have at least 6 variants
  for (const [context, count] of contextCounts) {
    if (count < 6 && context !== "generico") {
      issues.push(`Contexto "${context}" tiene solo ${count} variantes, mínimo recomendado: 6`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Validación de catálogo de ánimo falló:\n${issues.join("\n")}`);
  }
}

const parsed = loadConfig("animo-catalog", animoCatalogSchema, raw);
validateCatalog(parsed);

export const ANIMO_CATALOG: AnimoCatalogDTO = parsed;
