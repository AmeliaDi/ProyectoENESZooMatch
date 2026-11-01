"use client";

/**
 * Pixel sky background on a single <canvas>. Draws the seeded nebula (Bayer)
 * and three star layers at integer device-pixel sizes so nothing is ever
 * blurry; twinkle is stepwise at a low frame rate and stops entirely with
 * `prefers-reduced-motion` or when the tab is hidden.
 */

import { useEffect, useRef } from "react";

import { DESIGN_TOKENS } from "@/config";
import { generateNebula, generateStars, twinkleLevel, type SkySpec } from "@/ui/design/sky";

const SPEC: SkySpec = DESIGN_TOKENS.sky;
const STARS = generateStars(SPEC);

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface PixelSkyProps {
  /** Parallax offset in CSS px (e.g. the constellation pan); 0 = static. */
  offsetX?: number;
  offsetY?: number;
  className?: string;
}

export function PixelSky({ offsetX = 0, offsetY = 0, className }: PixelSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offsetRef = useRef({ x: offsetX, y: offsetY });

  useEffect(() => {
    offsetRef.current = { x: offsetX, y: offsetY };
  }, [offsetX, offsetY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const logicalPx = DESIGN_TOKENS.pixel.logicalPx;
    const levels = DESIGN_TOKENS.sky.twinkleLevels;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cellPx = 1;
    let cols = 0;
    let rows = 0;
    let nebula: ReturnType<typeof generateNebula> = [];
    let frame = 0;
    let last = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Integer device pixels per logical cell keeps every star square.
      cellPx = Math.max(1, Math.round(logicalPx * window.devicePixelRatio));
      cols = Math.ceil((rect.width * window.devicePixelRatio) / cellPx);
      rows = Math.ceil((rect.height * window.devicePixelRatio) / cellPx);
      canvas.width = cols * cellPx;
      canvas.height = rows * cellPx;
      nebula = generateNebula(SPEC, cols, rows);
      draw(performance.now());
    }

    function draw(time: number) {
      if (!context) return;
      const colors = {
        sky: cssVar("--zm-sky"),
        star: cssVar("--zm-star"),
        "nebula-1": cssVar("--zm-nebula-1"),
        "nebula-2": cssVar("--zm-nebula-2"),
      };
      context.fillStyle = colors.sky;
      context.fillRect(0, 0, cols * cellPx, rows * cellPx);
      for (const cell of nebula) {
        context.fillStyle = colors[cell.tone];
        context.fillRect(cell.x * cellPx, cell.y * cellPx, cellPx, cellPx);
      }
      context.fillStyle = colors.star;
      const tile = SPEC.tileCells;
      const dpr = window.devicePixelRatio;
      for (const star of STARS) {
        const layer = SPEC.layers[star.layer];
        const shiftX = Math.round((offsetRef.current.x * dpr * (layer?.parallax ?? 0)) / cellPx);
        const shiftY = Math.round((offsetRef.current.y * dpr * (layer?.parallax ?? 0)) / cellPx);
        const level = reduced.matches ? 0 : twinkleLevel(star, time, levels.length);
        context.globalAlpha = levels[level] ?? 1;
        for (let ty = 0; ty * tile < rows + tile; ty += 1) {
          for (let tx = 0; tx * tile < cols + tile; tx += 1) {
            const x = (((star.x + shiftX) % tile) + tile) % tile + tx * tile;
            const y = (((star.y + shiftY) % tile) + tile) % tile + ty * tile;
            if (x < cols && y < rows) {
              context.fillRect(x * cellPx, y * cellPx, star.size * cellPx, star.size * cellPx);
            }
          }
        }
      }
      context.globalAlpha = 1;
    }

    function loop(time: number) {
      frame = requestAnimationFrame(loop);
      if (document.hidden || reduced.matches) return;
      if (time - last < 1000 / DESIGN_TOKENS.sky.twinkleFps) return;
      last = time;
      draw(time);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(() => draw(performance.now()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={["zm-sky", className ?? ""].join(" ")} aria-hidden="true" />;
}
