/**
 * Maps the icon keys emitted by the domain (category names) to pixel icons.
 * Unknown keys fall back to a neutral star so a new category never shows an
 * empty slot or, worse, a raw emoji.
 */

import type { IconName } from "./icons";

const CATEGORY_ICON: Record<string, IconName> = {
  personalidad: "personalidad",
  afinidad_cultural: "afinidad_cultural",
  intimidad_afecto: "intimidad_afecto",
  valores_relacionales: "valores_relacionales",
  identidad: "identidad",
};

const DIMENSION_PREFIX: ReadonlyArray<readonly [string, IconName]> = [
  ["personalidad_", "personalidad"],
  ["mbti_", "personalidad"],
  ["identidad_", "identidad"],
  ["cultural_", "afinidad_cultural"],
  ["intimidad_", "intimidad_afecto"],
  ["valores_", "valores_relacionales"],
];

export const FALLBACK_CATEGORY_ICON: IconName = "loading";

export function categoryIcon(key: string | null | undefined): IconName {
  if (!key) return FALLBACK_CATEGORY_ICON;
  const direct = CATEGORY_ICON[key];
  if (direct) return direct;
  const prefixed = DIMENSION_PREFIX.find(([prefix]) => key.startsWith(prefix));
  return prefixed ? prefixed[1] : FALLBACK_CATEGORY_ICON;
}
