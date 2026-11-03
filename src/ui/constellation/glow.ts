/**
 * Pre-rendered halo patterns of the constellation (ADR-027). Every halo is a
 * Bayer-dithered disc filled from one of these shared `<pattern>`s, so there
 * is no blur, no per-star mask and nothing is recomputed per frame.
 *
 * - `suave`: match halos, in three density steps that follow the affinity;
 * - `foco`: your own star (gold);
 * - `hito`: matches at ≥ 95 % (ADR-025, gold).
 *
 * Colours and opacities come from the per-mode `--zm-glow-*` tokens, so the
 * high-contrast modes switch every halo off from CSS alone.
 */

import { DESIGN_TOKENS } from "@/config";

import type { GlowLevel } from "./render-helpers";

/** Bayer coverage of each `suave` step (index = `GlowLevel`). */
export const SUAVE_COVERAGE: Readonly<Record<GlowLevel, number>> = { 0: 0.25, 1: 0.5, 2: 0.75 };
/** Gold halos are always the densest step. */
export const GOLD_COVERAGE = 0.75;

export function suavePatternId(level: GlowLevel): string {
  return `zm-glow-suave-${level}`;
}
export const FOCO_PATTERN_ID = "zm-glow-foco";
export const HITO_PATTERN_ID = "zm-glow-hito";

/**
 * Halo reach beyond the sprite edge, in user units (≈ CSS px at zoom 1). Night
 * and day share the radii (a test asserts it); high contrast hides the halos
 * through a zero opacity instead.
 */
const GLOW = DESIGN_TOKENS.modes.night.effects.glow;
export const GLOW_REACH = {
  suave: GLOW.suave.radiusPx,
  foco: GLOW.foco.radiusPx,
  hito: GLOW.hito.radiusPx,
} as const;
