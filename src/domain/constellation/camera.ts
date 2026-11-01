/**
 * View camera: a uniform zoom around a focus point, eased exponentially
 * towards its target so pinch, wheel and "recentrar" all glide the same way
 * at any frame rate (1 − e^(−rate·dt) is frame-rate independent).
 */

import type { PhysicsConfig } from "@/config";

import type { Vec2 } from "./types";

type CameraConfig = PhysicsConfig["camera"];

export interface Camera {
  /** World point shown at the viewport centre. */
  x: number;
  y: number;
  zoom: number;
  tx: number;
  ty: number;
  tzoom: number;
  /** Ease rate (1/s) currently in use; recentre is slower than follow. */
  rate: number;
}

export function createCamera(width: number, height: number, cfg: CameraConfig): Camera {
  return { x: width / 2, y: height / 2, zoom: 1, tx: width / 2, ty: height / 2, tzoom: 1, rate: cfg.followRate };
}

function clampZoom(zoom: number, cfg: CameraConfig): number {
  return Math.min(cfg.maxZoom, Math.max(cfg.minZoom, zoom));
}

/** Keeps the target centre inside the world so the sky can never be lost. */
function clampCentre(camera: Camera, width: number, height: number): void {
  camera.tx = Math.min(width, Math.max(0, camera.tx));
  camera.ty = Math.min(height, Math.max(0, camera.ty));
}

/** Screen (viewport px) → world. */
export function screenToWorld(camera: Camera, width: number, height: number, sx: number, sy: number): Vec2 {
  return { x: camera.x + (sx - width / 2) / camera.zoom, y: camera.y + (sy - height / 2) / camera.zoom };
}

/**
 * Zooms the target by `factor`, keeping the world point under `(sx, sy)`
 * fixed on screen once the camera arrives.
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  sx: number,
  sy: number,
  width: number,
  height: number,
  cfg: CameraConfig,
): void {
  const zoom = clampZoom(camera.tzoom * factor, cfg);
  const wx = camera.tx + (sx - width / 2) / camera.tzoom;
  const wy = camera.ty + (sy - height / 2) / camera.tzoom;
  camera.tzoom = zoom;
  camera.tx = wx - (sx - width / 2) / zoom;
  camera.ty = wy - (sy - height / 2) / zoom;
  camera.rate = cfg.followRate;
  clampCentre(camera, width, height);
}

/** Moves the target by a screen-space delta (two-finger pan). */
export function panBy(camera: Camera, dsx: number, dsy: number, width: number, height: number, cfg: CameraConfig): void {
  camera.tx -= dsx / camera.tzoom;
  camera.ty -= dsy / camera.tzoom;
  camera.rate = cfg.followRate;
  clampCentre(camera, width, height);
}

export function recenter(camera: Camera, width: number, height: number, cfg: CameraConfig): void {
  camera.tx = width / 2;
  camera.ty = height / 2;
  camera.tzoom = 1;
  camera.rate = cfg.recenterRate;
}

export function isCentred(camera: Camera, width: number, height: number): boolean {
  return camera.tzoom === 1 && camera.tx === width / 2 && camera.ty === height / 2;
}

/** Eases the camera; returns true while it is still moving. */
export function easeCamera(camera: Camera, dt: number): boolean {
  const k = 1 - Math.exp(-camera.rate * Math.max(0, dt));
  // Zoom eases in log space so zooming in and out feel symmetric.
  const logZoom = Math.log(camera.zoom);
  camera.zoom = Math.exp(logZoom + (Math.log(camera.tzoom) - logZoom) * k);
  camera.x += (camera.tx - camera.x) * k;
  camera.y += (camera.ty - camera.y) * k;
  const settled =
    Math.abs(camera.zoom - camera.tzoom) < 1e-4 &&
    Math.abs(camera.x - camera.tx) < 0.01 &&
    Math.abs(camera.y - camera.ty) < 0.01;
  if (settled) {
    camera.zoom = camera.tzoom;
    camera.x = camera.tx;
    camera.y = camera.ty;
  }
  return !settled;
}

/** SVG viewBox for the current camera. */
export function viewBox(camera: Camera, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const w = width / camera.zoom;
  const h = height / camera.zoom;
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
}
