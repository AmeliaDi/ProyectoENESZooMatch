/**
 * Pure selection logic for ánimo messages. Given a catalog, context, history,
 * and seed, picks one message deterministically. No side effects, no config
 * imports — the catalog and config are passed in, so this stays testable.
 */

import type {
  AnimoContext,
  AnimoHistory,
  ContextoEstacional,
  ContextoSocial,
  MomentoDelDia,
} from "./animo-context";

/**
 * A single message from the catalog. Matches the JSON schema in
 * `data/animo-catalog.json`.
 */
export interface AnimoMessage {
  id: string;
  categoria: "momento_del_dia" | "primera_entrada" | "contexto_social" | "animo_publicado" | "estacional" | "generico";
  contexto: string;
  texto: string;
  placeholders: readonly string[];
  intensidad: "suave" | "media";
  estacional: { inicio: string; fin: string } | null;
}

/**
 * The full catalog, as loaded from `data/animo-catalog.json`.
 */
export interface AnimoCatalog {
  version: string;
  mensajes: readonly AnimoMessage[];
}

/**
 * Priority order for context selection. Higher priority contexts are tried
 * first. If a context yields no messages (all in history or none match), the
 * selector moves to the next.
 */
const CONTEXT_PRIORITY: readonly string[] = [
  "match_nuevo",
  "invitacion_chat",
  "sin_matches",
  "despues_de_quiz",
  // estacional contexts are inserted dynamically based on date
  // animo contexts are inserted dynamically based on published mood
  "tras_eclosion",
  "del_dia",
  "tras_varios_dias",
  "manana",
  "tarde",
  "noche",
  "madrugada",
  "generico",
];

/**
 * Deterministic pseudo-random number generator (mulberry32). Given a 32-bit
 * seed, produces a sequence of numbers in [0, 1). Used to pick a message from
 * the filtered candidates without bias.
 */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit integer. Used to convert the seed (person ID +
 * date) into a number for the PRNG.
 */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

/**
 * Filter messages by contexto. Returns only messages whose `contexto` field
 * matches the given string.
 */
function filterByContexto(messages: readonly AnimoMessage[], contexto: string): readonly AnimoMessage[] {
  return messages.filter((m) => m.contexto === contexto);
}

/**
 * Remove messages whose IDs are in the history.
 */
function removeFromHistory(messages: readonly AnimoMessage[], history: AnimoHistory): readonly AnimoMessage[] {
  const historySet = new Set(history.shown);
  return messages.filter((m) => !historySet.has(m.id));
}

/**
 * Pick one message from the candidates using the seed. Returns null if no
 * candidates remain.
 */
function pickOne(candidates: readonly AnimoMessage[], seed: string): AnimoMessage | null {
  if (candidates.length === 0) return null;
  const random = mulberry32(hashString(seed));
  const index = Math.floor(random() * candidates.length);
  return candidates[index] ?? null;
}

/**
 * Check if a seasonal message's date range includes the current date.
 * Dates are in MM-DD format, no year. Handles year wraparound (e.g.,
 * "12-20" to "01-05" includes Dec 20-31 and Jan 1-5).
 */
function isDateInRange(currentDate: string, range: { inicio: string; fin: string }): boolean {
  const current = currentDate.slice(5); // "YYYY-MM-DD" → "MM-DD"
  const { inicio, fin } = range;
  if (inicio <= fin) {
    return current >= inicio && current <= fin;
  }
  // Wraparound: inicio > fin (e.g., "12-20" > "01-05")
  return current >= inicio || current <= fin;
}

/**
 * Get the seasonal contexts that match the current date.
 */
function getSeasonalContexts(catalog: readonly AnimoMessage[], fecha: string): readonly ContextoEstacional[] {
  const contexts = new Set<ContextoEstacional>();
  for (const msg of catalog) {
    if (msg.categoria === "estacional" && msg.estacional && isDateInRange(fecha, msg.estacional)) {
      contexts.add(msg.contexto as ContextoEstacional);
    }
  }
  return Array.from(contexts);
}

/**
 * Build the full priority list for this context, inserting seasonal and animo
 * contexts in the right positions.
 */
function buildPriorityList(ctx: AnimoContext, catalog: readonly AnimoMessage[]): readonly string[] {
  const priority = [...CONTEXT_PRIORITY];

  // Insert seasonal contexts after social contexts
  if (ctx.estacionalesActivos) {
    const seasonalContexts = getSeasonalContexts(catalog, ctx.fecha);
    const insertIndex = priority.indexOf("tras_eclosion");
    if (insertIndex >= 0 && seasonalContexts.length > 0) {
      priority.splice(insertIndex, 0, ...(seasonalContexts as string[]));
    }
  }

  // Insert animo context after seasonal
  if (ctx.animo) {
    const insertIndex = priority.findIndex((c) => c.startsWith("tras_"));
    if (insertIndex >= 0) {
      priority.splice(insertIndex, 0, ctx.animo);
    }
  }

  return priority;
}

/**
 * Get the social context string from the ContextoSocial union.
 */
function getSocialContextString(social: ContextoSocial): string | null {
  return social.kind === "none" ? null : social.kind;
}

/**
 * Get the momento del día context string.
 */
function getMomentoContextString(momento: MomentoDelDia): string {
  return momento;
}

/**
 * Get the primera entrada context string.
 */
function getPrimeraContextString(ctx: AnimoContext): string | null {
  if (ctx.primera.kind === "none") return null;
  return ctx.primera.kind;
}

/**
 * Select an ánimo message given the catalog, context, and history. Returns null
 * if messages are disabled or no suitable message is found.
 *
 * The selection is deterministic: given the same catalog, context, history, and
 * seed, it always returns the same message. The seed should be a combination of
 * person ID and date to ensure variety across people and days.
 */
export function pickAnimoMessage(
  catalog: AnimoCatalog,
  ctx: AnimoContext,
  history: AnimoHistory,
  seed: string,
): AnimoMessage | null {
  // If messages are disabled, return null immediately
  if (!ctx.mensajesActivos) return null;

  // Build the priority list for this context
  const priority = buildPriorityList(ctx, catalog.mensajes);

  // Try each context in priority order
  for (const contexto of priority) {
    let candidates = filterByContexto(catalog.mensajes, contexto);

    // For social contexts, only include if the context matches
    if (["match_nuevo", "invitacion_chat", "sin_matches", "despues_de_quiz"].includes(contexto)) {
      const socialCtx = getSocialContextString(ctx.social);
      if (socialCtx !== contexto) continue;
    }

    // For momento del día, only include if it matches
    if (["manana", "tarde", "noche", "madrugada"].includes(contexto)) {
      const momentoCtx = getMomentoContextString(ctx.momento);
      if (momentoCtx !== contexto) continue;
    }

    // For primera entrada, only include if it matches
    if (["tras_eclosion", "del_dia", "tras_varios_dias"].includes(contexto)) {
      const primeraCtx = getPrimeraContextString(ctx);
      if (primeraCtx !== contexto) continue;
    }

    // For seasonal contexts, only include if the date matches
    if (candidates.length > 0 && candidates[0]?.categoria === "estacional") {
      const seasonalContexts = getSeasonalContexts(catalog.mensajes, ctx.fecha);
      if (!seasonalContexts.includes(contexto as ContextoEstacional)) continue;
    }

    // Remove messages in history
    candidates = removeFromHistory(candidates, history);

    // If any candidates remain, pick one
    const picked = pickOne(candidates, seed);
    if (picked) return picked;
  }

  // If no context yielded a message, return null (or a safe fallback)
  return null;
}

/**
 * Update the history with a newly shown message. Returns a new history object
 * with the message ID added and the oldest removed if the history is full.
 */
export function updateHistory(history: AnimoHistory, messageId: string): AnimoHistory {
  const newShown = [...history.shown, messageId];
  if (newShown.length > history.maxSize) {
    newShown.shift(); // Remove oldest
  }
  return { ...history, shown: newShown };
}
