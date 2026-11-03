import type { CSSProperties } from "react";

import { canDrawPixelText, layoutPixelText } from "@/domain/shared";

/**
 * Integer scales of the 5×7 atlas: one glyph cell = `scale` logical pixels
 * (`--zm-px`), so a digit is 7 · 2 · scale CSS px tall and never lands on a
 * fractional pixel.
 */
export const PIXNUM_SCALE = { sm: 1, md: 2, lg: 3 } as const;
export type PixelNumberSize = keyof typeof PIXNUM_SCALE;

export interface PixelNumberProps {
  /** What to draw: digits and `% . , : / + − × x` and spaces (see the atlas). */
  value: string;
  size?: PixelNumberSize;
  /** Gold only for key figures under the gold rule (ADR-027): the ≥ 95 % match. */
  gold?: boolean;
  className?: string;
}

/**
 * Highlighted figure drawn with the 5×7 pixel atlas (ADR-028). The drawing is
 * decorative (`aria-hidden`) and the real text sits next to it in a visually
 * hidden span, so screen readers, find-in-page and copy all get the value.
 */
export function PixelNumber({ value, size = "md", gold = false, className }: PixelNumberProps) {
  const goldClass = gold ? "zm-pixnum--gold" : "";
  if (!canDrawPixelText(value)) {
    // Never drop a character: anything outside the atlas reads in Atkinson tabular.
    return <span className={["zm-num", goldClass, className ?? ""].filter(Boolean).join(" ")}>{value}</span>;
  }
  const layout = layoutPixelText(value);
  const style = {
    "--pixnum-w": layout.width,
    "--pixnum-h": layout.height,
    "--pixnum-scale": PIXNUM_SCALE[size],
  } as CSSProperties;
  const classes = ["zm-pixnum", goldClass, className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style} data-size={size}>
      <svg
        className="zm-pixnum__svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
        focusable="false"
        shapeRendering="crispEdges"
      >
        {layout.runs.map((run) => (
          <rect key={`${run.x}:${run.y}`} x={run.x} y={run.y} width={run.width} height={1} />
        ))}
      </svg>
      <span className="zm-sr-only">{value}</span>
    </span>
  );
}
