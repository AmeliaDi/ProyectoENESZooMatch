/**
 * Single entry point for every bundled data file. Each module validates its
 * JSON with Zod at load time and exports frozen objects; nothing else in
 * `src/` may import from `data/` directly.
 */
export { CATALOG, CATALOG_ANIMALS, CATALOG_COLORS, MBTI_CODES } from "./catalog";
export { ENNEAGRAM_ASSIGNMENTS, ENNEAGRAM_DATA } from "./enneagram";
export { MATCHING_CONFIG } from "./matching";
export { LIKERT_SCALE, QUIZ_ITEMS, QUIZ_VERSION } from "./quiz";
