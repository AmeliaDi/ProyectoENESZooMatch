"use client";

/**
 * The egg (Fase 3). A person who has not hatched is drawn as a cascarón whose
 * speckles come from `huevitoSeed` — cosmetic only — and whose cracks come from
 * core progress. It never shows an animal, a colour or a name, because none
 * exists yet.
 *
 * Motion (breathing, wobble, glow pulse) lives in CSS and is dropped under
 * `prefers-reduced-motion`, where the only thing left is an opacity fade.
 */

import { GRID_SIZE } from "@/domain/avatars/pixel-sprites";
import { EGG_BOTTOM_ROW, EGG_TOP_ROW, eggCrackStage, getEggSprite } from "@/domain/avatars/egg-sprite";

const CRACK_STAGES = 4;

export interface PixelEggProps {
  /** Cosmetic seed from the server; any stable string works as its carrier. */
  seed: string | number | null | undefined;
  /** Core questions answered and total, so the cracks track real progress. */
  answered?: number;
  total?: number;
  /** Precomputed progress stage; ignored when `answered`/`total` are given. */
  progressPercent?: number;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/** Stable 32-bit seed from whatever the caller carries (never a psychometric number). */
function numericSeed(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value) >>> 0;
  if (typeof value !== "string") return 0;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stageOf(answered: number | undefined, total: number | undefined, percent: number | undefined): number {
  if (typeof answered === "number" && typeof total === "number") {
    return eggCrackStage(answered, total, CRACK_STAGES);
  }
  return eggCrackStage(Number.isFinite(percent) ? (percent ?? 0) : 0, 100, CRACK_STAGES);
}

export function PixelEgg({ seed, answered, total, progressPercent, size = 128, className, ariaLabel }: PixelEggProps) {
  const stage = stageOf(answered, total, progressPercent);
  const sprite = getEggSprite(numericSeed(seed), stage, CRACK_STAGES);
  const glow = sprite.glow;
  /** Tope del aura: crece con el núcleo (0.10 → 0.28), no con el azar. */
  const auraGlow = 0.1 + 0.06 * stage;

  return (
    <svg
      className={`zm-egg zm-crisp${className ? ` ${className}` : ""}`}
      data-crack-stage={stage}
      style={{ width: size, height: size, ["--egg-glow" as string]: auraGlow }}
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      role="img"
      aria-label={ariaLabel ?? "Tu huevito, todavía en su cascarón"}
    >
      <ellipse
        className="zm-egg__aura"
        cx={GRID_SIZE / 2}
        cy={(EGG_TOP_ROW + EGG_BOTTOM_ROW) / 2 + 0.5}
        rx={6.5}
        ry={7.5}
        fill={glow}
      />
      {sprite.grid.flatMap((row, y) =>
        row.map((color, x) =>
          color ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
          ) : null,
        ),
      )}
    </svg>
  );
}
