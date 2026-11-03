/**
 * Contrast audit of what the token pairs alone cannot see (ADR-027): text on
 * a bright star behind the veil, constellation lines at their minimum
 * opacity, the % label on weak / dimmed stars, the sprite outline on both
 * skies and the gold scale. Pure: `contrast-audit.test.ts` fails `npm run
 * check` on any regression and `/dev/ui` renders the same rows.
 */

import { DESIGN_TOKENS, THEME_MODES, type ColorRole, type ThemeMode } from "@/config";

import { contrastRatio, mixHex } from "./contrast";

export type AuditKind = "text" | "textLarge" | "ui";

export interface AuditRow {
  mode: ThemeMode;
  group: "estrella" | "líneas" | "lienzo" | "sprites" | "oro";
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  /** Value measured on the pre-Phase-1 tokens (docs/AUDITORIA_VISUAL.md), if any. */
  before?: number;
}

export interface AuditInputs {
  /** Lowest stroke opacity of a constellation line. */
  lineOpacityMin: number;
  /** Lowest opacity of the % label (weak or dimmed star). */
  labelOpacityMin: number;
  /** Silhouette outline ink of the sprites. */
  spriteOutline: string;
}

export function minimumFor(mode: ThemeMode, kind: AuditKind): number {
  const { contrast } = DESIGN_TOKENS;
  const high = DESIGN_TOKENS.modes[mode].highContrast;
  if (kind === "ui") return high ? contrast.uiHighContrast : contrast.ui;
  if (kind === "textLarge") return high ? contrast.uiHighContrast : contrast.textLarge;
  return high ? contrast.textHighContrast : contrast.text;
}

/** Pre-Phase-1 measurements (AUDITORIA_VISUAL §2.2, §3, §4), for the before/after view. */
const BEFORE: Partial<Record<ThemeMode, Readonly<Record<string, number>>>> = {
  night: { "fg · estrella": 2.8, "fg-muted · estrella": 1.9, "gold · estrella": 1.74, "línea rim": 2.31, "línea dorada": 2.78, "% atenuado": 5.16, "contorno sprite": 2.02 },
  day: { "fg · estrella": 4.04, "fg-muted · estrella": 2.11, "gold · estrella": 1.81, "línea rim": 1.78, "línea dorada": 2.01, "% atenuado": 3.49, "contorno sprite": 2.07 },
  "night-hc": { "fg · estrella": 3.45 },
  "day-hc": { "fg · estrella": 4.56 },
};

const VEILED_TEXT: ReadonlyArray<readonly [ColorRole, AuditKind]> = [
  ["fg", "text"],
  ["fg-muted", "text"],
  ["romance", "text"],
  ["amistad", "text"],
  ["danger", "text"],
  ["gold", "text"],
];

const GOLD_TEXT_STEPS: readonly ColorRole[] = ["oro-400", "oro-500", "oro-600", "oro-700"];

export function auditMode(mode: ThemeMode, inputs: AuditInputs): AuditRow[] {
  const { colors, effects } = DESIGN_TOKENS.modes[mode];
  const before = BEFORE[mode] ?? {};
  const rows: AuditRow[] = [];
  const push = (group: AuditRow["group"], label: string, fg: string, bg: string, kind: AuditKind) => {
    const row: AuditRow = { mode, group, label, fg, bg, ratio: contrastRatio(fg, bg), min: minimumFor(mode, kind) };
    const was = before[label];
    rows.push(was === undefined ? row : { ...row, before: was });
  };

  // A bright star under the veil: the plate is the sky at --zm-veil over the star.
  const veiledStar = mixHex(colors.sky, colors.star, effects.veil);
  for (const [role, kind] of VEILED_TEXT) push("estrella", `${role} · estrella`, colors[role], veiledStar, kind);

  // Lines: rim / gold at the minimum stroke opacity, composited over the sky.
  push("líneas", "línea rim", mixHex(colors.rim, colors.sky, inputs.lineOpacityMin), colors.sky, "ui");
  push("líneas", "línea dorada", mixHex(colors.gold, colors.sky, inputs.lineOpacityMin), colors.sky, "ui");

  // % label on a weak or dimmed star (fg at its opacity floor) and the radiant % in gold.
  push("lienzo", "% atenuado", mixHex(colors.fg, colors.sky, inputs.labelOpacityMin), colors.sky, "text");
  // The gold % is never faded (affinityLabelOpacity), so it is measured opaque.
  push("lienzo", "% dorado", colors.gold, colors.sky, "text");
  push("lienzo", "anillo de selección", colors.gold, colors.sky, "ui");

  // Sprite outline against the sky of this mode. Sprites are not recoloured
  // per theme, so the bar is the plain 3:1 of WCAG 1.4.11 in every mode.
  const outline = inputs.spriteOutline;
  const was = before["contorno sprite"];
  const spriteRow: AuditRow = {
    mode, group: "sprites", label: "contorno sprite", fg: outline, bg: colors.sky,
    ratio: contrastRatio(outline, colors.sky), min: DESIGN_TOKENS.contrast.ui,
  };
  rows.push(was === undefined ? spriteRow : { ...spriteRow, before: was });

  // Gold scale: the text steps on every surface, oro-300 as UI.
  for (const step of GOLD_TEXT_STEPS) {
    for (const surface of ["sky", "frame", "raised"] as const) {
      push("oro", `${step} · ${surface}`, colors[step], colors[surface], "text");
    }
  }
  push("oro", "oro-300 · sky (UI)", colors["oro-300"], colors.sky, "ui");
  push("oro", "foco · sky", colors.focus, colors.sky, "ui");
  return rows;
}

export function auditAll(inputs: AuditInputs): AuditRow[] {
  return THEME_MODES.flatMap((mode) => auditMode(mode, inputs));
}
