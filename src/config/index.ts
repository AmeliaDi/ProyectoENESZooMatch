/**
 * Single entry point for every bundled data file. Each module validates its
 * JSON with Zod at load time and exports frozen objects; nothing else in
 * `src/` may import from `data/` directly.
 */
export { CATALOG, CATALOG_ANIMALS, CATALOG_COLORS, MBTI_CODES } from "./catalog";
export { COLOR_ROLES, DESIGN_TOKENS, THEME_MODES } from "./design";
export type { ColorRole, DesignTokens, ThemeMode } from "./design";
export { ENNEAGRAM_ASSIGNMENTS, ENNEAGRAM_DATA } from "./enneagram";
export { EXPERIENCE } from "./experience";
export type { Experience } from "./experience";
export { MATCHING_CONFIG } from "./matching";
export { PHYSICS, physicsSchema } from "./physics";
export type { PhysicsConfig } from "./physics";
export {
  CORE_ITEMS,
  LIKERT_SCALE,
  QUIZ_ITEMS,
  QUIZ_MODULES,
  QUIZ_VERSION,
  isSkippableItem,
} from "./quiz";
