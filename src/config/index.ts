/**
 * Single entry point for every bundled data file. Each module validates its
 * JSON with Zod at load time and exports frozen objects; nothing else in
 * `src/` may import from `data/` directly.
 */
export { ACCESS_CONFIG } from "./access";
export type { AccessConfig } from "./access";
export { ADMIN_CONFIG } from "./admin";
export type { AdminConfig } from "./admin";
export { AVATAR_CONFIG } from "./avatars";
export type { AvatarConfig } from "./avatars";
export { CHAT_CONFIG } from "./chat";
export type { ChatConfig } from "./chat";
export { CHAT_SOCIAL_NETWORKS } from "./chat-contact";
export { CHAT_EMOJI } from "./chat-emoji";
export type { ChatEmoji, ChatEmojiCatalog } from "./chat-emoji";


export { CATALOG, CATALOG_ANIMALS, CATALOG_COLORS, MBTI_CODES } from "./catalog";
export { COLOR_ROLES, DESIGN_TOKENS, GLOW_TIERS, THEME_MODES } from "./design";
export type { ColorRole, DesignTokens, GlowTier, ThemeMode } from "./design";
export { ENNEAGRAM_ASSIGNMENTS, ENNEAGRAM_DATA } from "./enneagram";
export { EXPERIENCE } from "./experience";
export type { Experience } from "./experience";
export { MATCHING_CONFIG } from "./matching";
export { PHYSICS, physicsSchema } from "./physics";
export type { PhysicsConfig } from "./physics";
export { RETENTION_CONFIG, retentionConfigSchema } from "./retention";
export type { RetentionConfig } from "./retention";
export { RETAKE_PLANS, retakeRegistrySchema } from "./retake-plans";
export { ROLLOUT_GATES, rolloutGatesSchema } from "./rollout-gates";
export { SOUND, SOUND_CATEGORIES, SOUND_EVENTS, soundDurationMs, soundSchema } from "./sound";
export type { SoundCategory, SoundConfig, SoundEventId, SoundRecipe, SoundVoice } from "./sound";
export {
  CORE_ITEMS,
  LIKERT_SCALE,
  QUIZ_ITEMS,
  QUIZ_MODULES,
  QUIZ_VERSION,
  isSkippableItem,
} from "./quiz";
