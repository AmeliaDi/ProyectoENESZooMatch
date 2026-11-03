/**
 * Builds the CSS custom properties for each theme mode from the validated
 * design tokens. `atlas.css` holds the same values for first paint; a test
 * asserts the two never drift (`design.test.ts`).
 */

import { GLOW_TIERS, type ColorRole, type DesignTokens, type ThemeMode } from "@/config";

export function modeVariables(tokens: DesignTokens, mode: ThemeMode): Record<string, string> {
  const colors = tokens.modes[mode].colors;
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(colors) as [ColorRole, string][]) {
    out[`--zm-${role}`] = value;
  }
  return out;
}

/**
 * Per-mode effects: veil opacity, title outline/halo roles and the three glow
 * tiers. Colours are written as `var(--zm-role)` so they follow the palette.
 */
export function effectVariables(tokens: DesignTokens, mode: ThemeMode): Record<string, string> {
  const { effects } = tokens.modes[mode];
  const out: Record<string, string> = {
    "--zm-veil": String(effects.veil),
    "--zm-text-outline": `var(--zm-${effects.textOutline})`,
    "--zm-title-glow": `var(--zm-${effects.titleGlow})`,
  };
  for (const tier of GLOW_TIERS) {
    const glow = effects.glow[tier];
    out[`--zm-glow-${tier}`] = `var(--zm-${glow.color})`;
    out[`--zm-glow-${tier}-r`] = `${glow.radiusPx}px`;
    out[`--zm-glow-${tier}-o`] = String(glow.opacity);
  }
  return out;
}

export function cubicBezierCss(points: readonly number[]): string {
  return `cubic-bezier(${points.join(", ")})`;
}
