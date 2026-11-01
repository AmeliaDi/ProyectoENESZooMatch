/**
 * Throw estimation for drag release: a least-squares line through the
 * pointer samples of the last `windowMs`, which is far steadier than the
 * last two samples (touch digitisers are noisy at 120 Hz).
 */

import type { Vec2 } from "./types";

export interface PointerSample {
  /** Milliseconds (any monotonic clock). */
  t: number;
  x: number;
  y: number;
}

export interface PointerTrail {
  samples: PointerSample[];
}

const MAX_SAMPLES = 32;

export function createTrail(): PointerTrail {
  return { samples: [] };
}

export function pushSample(trail: PointerTrail, sample: PointerSample): void {
  trail.samples.push(sample);
  if (trail.samples.length > MAX_SAMPLES) trail.samples.shift();
}

/** Velocity in world px per second, clamped to `maxSpeed`. */
export function estimateVelocity(trail: PointerTrail, nowMs: number, windowMs: number, maxSpeed: number): Vec2 {
  const recent = trail.samples.filter((s) => nowMs - s.t <= windowMs);
  if (recent.length < 2) return { x: 0, y: 0 };
  const n = recent.length;
  let mt = 0;
  let mx = 0;
  let my = 0;
  for (const s of recent) {
    mt += s.t / n;
    mx += s.x / n;
    my += s.y / n;
  }
  let stt = 0;
  let stx = 0;
  let sty = 0;
  for (const s of recent) {
    const dt = s.t - mt;
    stt += dt * dt;
    stx += dt * (s.x - mx);
    sty += dt * (s.y - my);
  }
  if (stt < 1e-9) return { x: 0, y: 0 };
  let vx = (stx / stt) * 1000;
  let vy = (sty / stt) * 1000;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    vx *= maxSpeed / speed;
    vy *= maxSpeed / speed;
  }
  return { x: vx, y: vy };
}
