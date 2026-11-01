/**
 * Builds the CSS custom properties for each theme mode from the validated
 * design tokens. `globals.css` holds the same values for first paint; a test
 * asserts the two never drift (`design.test.ts`).
 */

import type { ColorRole, DesignTokens, ThemeMode } from "@/config";

export function modeVariables(tokens: DesignTokens, mode: ThemeMode): Record<string, string> {
  const colors = tokens.modes[mode].colors;
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(colors) as [ColorRole, string][]) {
    out[`--zm-${role}`] = value;
  }
  return out;
}

export function cubicBezierCss(points: readonly number[]): string {
  return `cubic-bezier(${points.join(", ")})`;
}
