/**
 * The entry scene: the sky "amanece" star by star and the last one is yours,
 * with a pixel sparkle. Pure CSS steps (no JS timers); reduced motion shows
 * the finished sky at once.
 */

import type { CSSProperties } from "react";

import { EXPERIENCE } from "@/config";
import { dawnStars, sparkleCells } from "@/ui/design/dawn";

const { gridWidth: W, gridHeight: H, stars: COUNT, seed, stepMs, sparkleArm } = EXPERIENCE.dawn;
const STARS = dawnStars({ width: W, height: H, count: COUNT, seed });
const SPARKLE = sparkleCells(sparkleArm);

export function DawnSky() {
  return (
    <svg
      className="zm-dawn zm-crisp"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {STARS.map((star) => {
        const style = { animationDelay: `${star.order * stepMs}ms` } as CSSProperties;
        if (!star.mine) {
          return (
            <rect
              key={star.order}
              className="zm-dawn__star"
              style={style}
              x={star.x}
              y={star.y}
              width={star.size}
              height={star.size}
            />
          );
        }
        const cx = star.x + 1;
        const cy = star.y + 1;
        return (
          <g key="mine" className="zm-dawn__mine" style={style}>
            {SPARKLE.map(([dx, dy]) => (
              <rect
                key={`${dx},${dy}`}
                className="zm-dawn__spark"
                x={cx + dx}
                y={cy + dy}
                width={1}
                height={1}
                opacity={1 - (Math.abs(dx) + Math.abs(dy)) / (sparkleArm + 1)}
              />
            ))}
            <rect x={star.x} y={star.y} width={star.size} height={star.size} />
          </g>
        );
      })}
    </svg>
  );
}
