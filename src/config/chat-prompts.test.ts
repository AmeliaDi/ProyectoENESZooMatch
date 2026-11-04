/**
 * Copy linter of the guided question bank (docs/CHAT.md §11.1): length, one
 * idea, no duplicates, no forbidden topics, gender-neutral wording, light
 * reading level, and balance by level and track.
 */
import { describe, expect, it } from "vitest";

import { CHAT_PROMPTS, MAX_PROMPT_CHARS, PROMPT_CATEGORIES } from "./chat-prompts";

const PROMPTS = CHAT_PROMPTS.preguntas;
const texts = PROMPTS.flatMap((p) => [p.texto, ...p.variantes]);

/** Forbidden topics: explicit sexuality, money, health, religion, politics, trauma, looks, identifying data. */
const FORBIDDEN_TOPICS: Array<[string, RegExp]> = [
  ["sexualidad", /\b(sexo|sexual|cama|desnud|nudes?|excita|caliente|íntim)/i],
  ["dinero", /\b(dinero|sueldo|salario|ganas al mes|deuda|tarjeta|pesos|cuánto cuesta|rico|pobre)\b/i],
  ["salud", /\b(enfermedad|diagnóstico|medicamento|terapia|depresi|ansiedad|trastorno|hospital|peso corporal|dieta)\b/i],
  ["religión", /\b(religi|dios|iglesia|rezar|fe en|creyente|ateo)/i],
  ["política", /\b(polític|partido|votar|voto|elecci|izquierda|derecha|presidente)/i],
  ["trauma", /\b(trauma|abuso|violencia|muerte|murió|duelo|peor momento|herida)/i],
  ["apariencia", /\b(físico|física|cuerpo|guap|te ves bonit|eres bonit|feo|fea|atractiv|tatuaje|estatura|cómo te ves|tu apariencia|tu cara)/i],
  ["datos identificables", /\b(teléfono|celular|número|correo|instagram|insta\b|whatsapp|dirección|dónde vives|apellido|matrícula|en qué facultad|(tu|qué) grupo|redes sociales)\b/i],
];
/** Gendered forms addressed to the reader ("¿estás cansado?"); prompts stay neutral. */
const GENDERED = /\b(cansad[oa]|nervios[oa]|enamorad[oa]|solter[oa]|novi[oa]|chic[oa]|amig[oa]s? (íntim|mejor)|tod[oa]s|el mejor amigo|la mejor amiga)\b/i;
/** Light reading: average words per sentence and longest word. */
const MAX_WORDS = 26;
const MAX_WORD_LENGTH = 16;

describe("chat question bank", () => {
  it("has 80–120 questions balanced by level and track", () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(80);
    expect(PROMPTS.length).toBeLessThanOrEqual(120);
    for (const level of [1, 2, 3] as const) {
      for (const track of ["romance", "amistad"] as const) {
        const usable = PROMPTS.filter((p) => p.nivel === level && (p.track === track || p.track === "ambos"));
        expect(usable.length, `${track} nivel ${level}`).toBeGreaterThanOrEqual(15);
      }
    }
    for (const category of PROMPT_CATEGORIES) expect(PROMPTS.some((p) => p.categoria === category), category).toBe(true);
  });

  it("keeps each question short, single and a real question", () => {
    for (const text of texts) {
      expect(text.length, text).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
      expect(text, text).toMatch(/\?$/);
      expect((text.match(/\?/g) ?? []).length, text).toBe(1);
      expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(MAX_WORDS);
      for (const word of text.split(/[\s,.;:¿?¡!]+/)) expect(word.length, word).toBeLessThanOrEqual(MAX_WORD_LENGTH);
    }
  });

  it("has no duplicates (ids or texts)", () => {
    const normalized = PROMPTS.map((p) => p.texto.toLowerCase().replace(/[^a-záéíóúñü ]/g, "").trim());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("never touches a forbidden topic", () => {
    for (const text of texts) {
      for (const [topic, pattern] of FORBIDDEN_TOPICS) expect(text, `${topic}: ${text}`).not.toMatch(pattern);
    }
  });

  it("is gender-neutral and free of pressure or destiny words", () => {
    for (const text of texts) {
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(/perfect[oa]|destino|alma gemela|para siempre|media naranja|urgente/i);
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("is never marked sensitive and leans on real model layers", () => {
    for (const p of PROMPTS) {
      expect(p.sensible).toBe(false);
      expect(p.dimensiones_relacionadas.length).toBeGreaterThan(0);
    }
  });
});
