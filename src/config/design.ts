import { z } from "zod";

import rawTokens from "../../data/design-tokens.json";
import { loadConfig } from "./load";

const HEX = /^#[0-9A-F]{6}$/;

export const COLOR_ROLES = [
  "sky", "frame", "raised",
  "fg", "fg-muted",
  "gold", "on-gold",
  "romance", "on-romance",
  "amistad", "on-amistad",
  "danger", "on-danger",
  "rim", "focus",
  "shadow", "grid", "star",
  "nebula-1", "nebula-2",
  // Gold scale, designed per mode: a higher step always contrasts more with the sky.
  "oro-100", "oro-200", "oro-300", "oro-400", "oro-500", "oro-600", "oro-700",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

/** Halo tiers of the constellation and of highlighted UI. */
export const GLOW_TIERS = ["suave", "foco", "hito"] as const;
export type GlowTier = (typeof GLOW_TIERS)[number];

export const THEME_MODES = ["night", "day", "night-hc", "day-hc"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

const hex = z.string().regex(HEX, "colors must be uppercase #RRGGBB");
const role = z.enum(COLOR_ROLES);
const positiveInt = z.number().int().positive();
const unit = z.number().min(0).max(1);

const palette = z.strictObject(
  Object.fromEntries(COLOR_ROLES.map((name) => [name, hex])) as Record<ColorRole, typeof hex>,
);

const glow = z.strictObject({
  color: role,
  /** Halo reach beyond the element, in CSS px (multiple of the logical pixel; 0 = no halo). */
  radiusPx: z.number().int().min(0),
  opacity: unit,
});

const effects = z.strictObject({
  /** Opacity of the sky-coloured veil laid behind long copy that sits on the sky. */
  veil: unit,
  /** Role of the hard 1-logical-pixel outline around pixel titles. */
  textOutline: role,
  /** Role of the faint offset halo around pixel titles. */
  titleGlow: role,
  glow: z.strictObject({ suave: glow, foco: glow, hito: glow }),
});

const mode = z.strictObject({ highContrast: z.boolean(), colors: palette, effects });

const cubicBezier = z.tuple([unit, z.number(), unit, z.number()]);

const starLayer = z.strictObject({
  size: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  density: z.number().positive().max(0.05),
  twinkles: z.boolean(),
  parallax: unit,
});

const nebulaBlob = z.strictObject({
  x: unit, y: unit, rx: unit, ry: unit,
  tone: z.enum(["nebula-1", "nebula-2"]),
  peak: unit,
});

export const designTokensSchema = z
  .strictObject({
    version: z.string().min(1),
    direction: z.string().min(1),
    pixel: z.strictObject({
      logicalPx: z.union([z.literal(2), z.literal(3)]),
      spriteGrid: positiveInt,
      iconGrid: positiveInt,
      iconScale: positiveInt,
      spriteScales: z.strictObject({ chip: positiveInt, node: positiveInt, detail: positiveInt }),
      atlasTickEvery: positiveInt,
    }),
    touchTargetMin: z.number().int().min(44),
    contrast: z.strictObject({
      text: z.number().min(4.5),
      /** WCAG large text (≥ 24 px, or ≥ 18.66 px bold). */
      textLarge: z.number().min(3),
      ui: z.number().min(3),
      textHighContrast: z.number().min(7),
      uiHighContrast: z.number().min(3),
      /** Stars may reach at most this share of the text-on-sky contrast, so they never compete with copy. */
      starMaxShareOfText: z.number().gt(0).lt(1),
    }),
    modes: z.strictObject({
      night: mode, day: mode, "night-hc": mode, "day-hc": mode,
    }),
    contrastPairs: z
      .array(z.strictObject({ fg: role, bg: z.array(role).min(1), kind: z.enum(["text", "ui"]) }))
      .min(1),
    motion: z.strictObject({
      durationsMs: z.strictObject({
        tap: positiveInt, exit: positiveInt, enter: positiveInt, emphasis: positiveInt, reveal: positiveInt,
      }),
      easings: z.strictObject({
        "atlas-out": cubicBezier, "atlas-in": cubicBezier, "atlas-in-out": cubicBezier,
      }),
      pixelSteps: positiveInt,
    }),
    zIndex: z.record(z.string(), z.number().int().min(0)),
    sky: z.strictObject({
      seed: z.number().int(),
      tileCells: positiveInt,
      layers: z.array(starLayer).length(3),
      twinklePeriodMs: z.tuple([positiveInt, positiveInt]).refine(([a, b]) => a < b, "min < max"),
      twinkleLevels: z.array(unit).min(2).max(3),
      twinkleFps: positiveInt,
      nebula: z.array(nebulaBlob).min(1).max(4),
    }),
  })
  .refine((t) => t.touchTargetMin % t.pixel.logicalPx === 0, "touch target must sit on the pixel grid")
  .refine(
    (t) =>
      Object.values(t.modes).every((m) =>
        Object.values(m.effects.glow).every((g) => g.radiusPx % t.pixel.logicalPx === 0),
      ),
    "glow radii must sit on the pixel grid",
  )
  .refine(
    (t) =>
      Object.values(t.modes).every(
        (m) => !m.highContrast || Object.values(m.effects.glow).every((g) => g.opacity === 0),
      ),
    "high-contrast modes carry no halos",
  );

export type DesignTokens = z.output<typeof designTokensSchema>;

/** Validated, frozen `data/design-tokens.json` (direction A · Atlas de bolsillo). */
export const DESIGN_TOKENS: Readonly<DesignTokens> = loadConfig(
  "design-tokens",
  designTokensSchema,
  rawTokens,
);
