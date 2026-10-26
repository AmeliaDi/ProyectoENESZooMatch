"use client";

/**
 * PixelAnimal — one animated pixel sprite.
 *
 * Renders a single `<image>` that samples a four-frame sprite sheet built by
 * `./sprite-sheet` (see that module for why we do not render 144 `<rect>`s per
 * node). The frame is swapped by writing the image's `x` attribute directly,
 * driven by the shared idle ticker in `./frame-ticker`, so a blinking
 * constellation of 50 stars costs zero React re-renders.
 *
 * The component is a standalone `<svg>` with its own 12×12 viewBox, which means
 * it works both nested inside the constellation's SVG (nested `<svg>` is valid
 * SVG) and inside plain HTML, e.g. the detail sheet's preview.
 */

import { memo, useEffect, useRef } from "react";

import { GRID_SIZE } from "@/lib/pixel-sprites";

import { getIdleFrameIndex, subscribeIdleFrames } from "./frame-ticker";
import { SHEET_WIDTH, frameIndex, spriteSheetUrl } from "./sprite-sheet";
import type { PixelAnimalProps, SpriteFrameName } from "./types";

/**
 * Resolves which frame to show. `null` means "let the shared ticker blink
 * between idle_1 and idle_2".
 */
function resolveFrame(
  frame: SpriteFrameName | undefined,
  romance: boolean,
  happy: boolean,
  animated: boolean,
): SpriteFrameName | null {
  if (frame) return frame;
  if (romance) return "romance_pulse";
  if (happy) return "happy";
  return animated ? null : "idle_1";
}

function PixelAnimalImpl({
  animalId,
  colorId,
  frame,
  romance = false,
  happy = false,
  animated = true,
  size,
  x = 0,
  y = 0,
  opacity = 1,
  className,
}: PixelAnimalProps) {
  const url = spriteSheetUrl(animalId, colorId);
  const pinned = resolveFrame(frame, romance, happy, animated);
  const imageRef = useRef<SVGImageElement | null>(null);

  useEffect(() => {
    const element = imageRef.current;
    if (!element) return;
    const shift = (column: number): void => {
      element.setAttribute("x", String(-GRID_SIZE * column));
    };
    if (pinned !== null) {
      shift(frameIndex(pinned));
      return;
    }
    // Join the shared blink at whatever phase the rest of the sky is on, so
    // stars mounted later do not stand out.
    shift(getIdleFrameIndex());
    return subscribeIdleFrames(shift);
  }, [pinned]);

  return (
    <svg
      className={className}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      opacity={opacity}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "hidden", pointerEvents: "none" }}
    >
      <image
        ref={imageRef}
        href={url}
        x={0}
        y={0}
        width={SHEET_WIDTH}
        height={GRID_SIZE}
        preserveAspectRatio="none"
        style={{ imageRendering: "pixelated" }}
      />
    </svg>
  );
}

/**
 * Memoised per (animalId, colorId, frame-ish props, size, opacity). The parent
 * canvas re-renders only when the static structure changes, so in practice this
 * memo mostly protects against unrelated parent updates.
 */
export const PixelAnimal = memo(PixelAnimalImpl);

export default PixelAnimal;
