/**
 * Theme modes as a dependency-free constant: the root layout's theme script
 * imports it, so it must not pull the validated JSON configs (or zod) into
 * every route's bundle.
 */
export const THEME_MODES = ["night", "day", "night-hc", "day-hc"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
