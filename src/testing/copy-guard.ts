/**
 * Copy guards shared by every test that reads text shown to a person.
 *
 * Four lists, because four different mistakes are possible:
 * - `FORBIDDEN_COPY` — words the product decided not to use (clinical framing,
 *   insults, "the one", forever-and-always certainties).
 * - `OUTCOME_CLAIMS` — sentences that promise something will happen between two
 *   people. The engine estimates affinity between two response vectors; it does
 *   not know whether a relationship forms, so no copy may say it does.
 * - `CAUSAL_EFFECT` — "your trait makes the other person feel X". Only checked
 *   on narrative that reaches the screen, where it would turn a description of
 *   a style into a promise about a partner.
 * - `INCLUSIVE_X` — the written `-x` marker in the copy nobody chose: it has no
 *   sound, so it fails the read-aloud and screen-reader rule of ADR-053.
 *
 * The word lists that used to live inside each test file are kept there when
 * they are narrower on purpose (`destino` and `probabilidad` are ordinary words
 * in a travel question and in a statistics disclaimer).
 */

/** Words and set phrases that must never appear in user-facing copy. */
export const FORBIDDEN_COPY =
  /perfect[oa]s?\b|media naranja|alma[s]? gemela|100 ?% compatible|garantizad[oa]|garantiza\b|para siempre|est[áa] escrito|\bel destino\b|\btu destino\b|universo conspir|no es casualidad|deshonest|mentiros|trampos[oa]|tramposx|codicios/i;

/**
 * Phrases that state, or promise, what will happen between two people.
 *
 * Three wordings that used to be here are deliberately absent, because they
 * also describe a person rather than a pairing: `vínculos que duren` and `lo
 * que te funciona` name a participant's own values, which is exactly what the
 * psychometrics measure ("Apuestas por vínculos que duren" is a portrait), and
 * `se nota al primer encuentro` describes an impression someone gives. The
 * guard targets sentences that speak about the two of them, not about one of
 * them; the archetype catalogue and the item banks stay inside the sweep.
 */
export const OUTCOME_CLAIMS =
  /universo conspir|momento llegará|aun no llega|todav[íi]a no llega|ser especial (que )?llega|qu[íi]mica incre[íi]ble|fluye de forma [úu]nica|esperando florecer|se complementan de forma|te lo har[áa] saber|har[íi]as click|por ?qu[ée] funciona|por ?qu[ée] conectan|construyen una relaci[óo]n|qued[óo] fijo para siempre/i;

/** "Trait X makes Y happen" — checked on rendered narrative only. */
export const CAUSAL_EFFECT = /\bhace que\b|\bhacen que\b|\bhar[áa] que\b|\bhar[áa]n que\b/i;

/**
 * The written inclusive marker: `unx`, `lxs`, `tranquilx`, `con cada unx`.
 *
 * ADR-053 keeps it out of the copy the product writes. It is not a spelling
 * mistake and nobody is ashamed of it — people do write it, and
 * `inclusive-text.ts` still offers it as a mode a person picks for themself.
 * What this guard protects is what nobody picked: a sentence the app puts on
 * screen that has no sound, so it cannot be read aloud and a screen reader
 * says a broken word exactly where the sentence meant to include someone.
 *
 * `/[a-z]+xs?\b/` alone is unusable, because `Fénix`, `Relax` and `Xbox` end in
 * `x` and carry no marker, so the pattern skips the closed list of x-words this
 * project legitimately writes. A new x-word that is not the marker goes in the
 * list, in the same commit that adds it.
 *
 * `X_EDGE` replaces `\b` on both sides. With the `u` flag `\b` counts only
 * ASCII word characters, so it fires between the `x` and the `á` of `exámenes`
 * and flags a perfectly good Spanish word — and on the right side it was the
 * only thing saying that `hex_h` is an identifier and not copy.
 */
const X_NOT_MARKER = "f[ée]nix|phoenix|fox|relax|netflix|xbox|box|max";

const X_EDGE = String.raw`[\p{L}\p{N}_{}-]`;

export const INCLUSIVE_X = new RegExp(
  `(?<!${X_EDGE})(?!(?:${X_NOT_MARKER})(?!${X_EDGE}))[\\p{L}]+xs?(?!${X_EDGE})`,
  "iu",
);

const LITERALS =
  /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\[\s\S])*)`/g;

/** Every string literal of a TS/TSX source, comments and code excluded. */
export function stringLiterals(source: string): string[] {
  return [...source.matchAll(LITERALS)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** Every string value of a JSON document, keyed path kept out of the way. */
export function jsonStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(jsonStrings);
  return [];
}
