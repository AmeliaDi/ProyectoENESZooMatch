/**
 * Layers a person may choose to show to the people in their sky (ADR-030).
 * Default: none — others see only alias, animal and colour. Hard filters,
 * politics and religion are never shareable (see `sharing.neverShare` in
 * `data/self-reading.json`). Mirrored by the SQL CHECK on
 * `profiles.shared_layers`.
 */
export const SHARE_LAYER_IDS = [
  "hexaco",
  "big_five",
  "mbti",
  "eneagrama",
  "valores",
  "relacional",
  "afecto",
  "estilo",
] as const;

export type ShareLayerId = (typeof SHARE_LAYER_IDS)[number];

export function isShareLayer(value: unknown): value is ShareLayerId {
  return typeof value === "string" && (SHARE_LAYER_IDS as readonly string[]).includes(value);
}
