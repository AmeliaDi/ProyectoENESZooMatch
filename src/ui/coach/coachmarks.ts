/**
 * Quick guide over the constellation — pure logic, no React and no DOM.
 *
 * - A tiny state machine (open / next / back / close) for the steps.
 * - The "already seen" store: localStorage behind try/catch plus an in-memory
 *   mirror, so private mode or a full quota never throws and never makes the
 *   guide pop up twice in the same session.
 * - Which variant to show (mobile card or desktop tooltip) from the pointer.
 * - Pixel-grid geometry for the gold highlight and the dimmed hole.
 */

export type CoachTarget = "self" | "canvas" | "tracks";
export type CoachVariant = "mobile" | "desktop";
export type CoachStepId = "self" | "drag" | "tap" | "tracks";
/** skip = only this time · finish/never = remembered on this device. */
export type CoachCloseReason = "skip" | "finish" | "never";

export interface CoachStep {
  id: CoachStepId;
  target: CoachTarget;
  /** Pixel finger animation under the text. */
  art?: "drag";
}

export const COACH_STEPS: readonly CoachStep[] = [
  { id: "self", target: "self" },
  { id: "drag", target: "canvas", art: "drag" },
  { id: "tap", target: "canvas" },
  { id: "tracks", target: "tracks" },
];

/**
 * The dimmed layer and the halo sit above the sky but must never steal a
 * drag, tap or pinch: they are `pointer-events: none` (checked against
 * coach.css by a test). Only the card itself takes pointers.
 */
export const COACH_PASSTHROUGH_CLASSES = ["zm-coach-layer", "zm-coach-dim", "zm-coach-halo"] as const;
export const COACH_INTERACTIVE_CLASSES = ["zm-coach-card", "zm-coach-tip"] as const;

// ─── State machine ───────────────────────────────────────────────────────────

export interface CoachState {
  open: boolean;
  variant: CoachVariant;
  step: number;
  closedBy: CoachCloseReason | null;
}

export type CoachAction =
  | { type: "open"; variant: CoachVariant }
  | { type: "next" }
  | { type: "back" }
  | { type: "close"; reason: CoachCloseReason };

export const COACH_INITIAL: CoachState = { open: false, variant: "mobile", step: 0, closedBy: null };

export function stepCount(variant: CoachVariant): number {
  return variant === "mobile" ? COACH_STEPS.length : 1;
}

export function isLastStep(state: CoachState): boolean {
  return state.step >= stepCount(state.variant) - 1;
}

export function coachReducer(state: CoachState, action: CoachAction): CoachState {
  switch (action.type) {
    case "open":
      return { open: true, variant: action.variant, step: 0, closedBy: null };
    case "next":
      if (!state.open) return state;
      return isLastStep(state) ? { ...state, open: false, closedBy: "finish" } : { ...state, step: state.step + 1 };
    case "back":
      return state.open ? { ...state, step: Math.max(0, state.step - 1) } : state;
    case "close":
      return state.open ? { ...state, open: false, closedBy: action.reason } : state;
  }
}

/** Desktop has a single "got it": any close counts as seen. */
export function persistsOnClose(reason: CoachCloseReason, variant: CoachVariant): boolean {
  return variant === "desktop" || reason !== "skip";
}

export function currentStep(state: CoachState): CoachStep | null {
  if (!state.open || state.variant !== "mobile") return null;
  return COACH_STEPS[state.step] ?? null;
}

// ─── Variant ─────────────────────────────────────────────────────────────────

export interface PointerEnv {
  /** `(pointer: coarse)` matches. */
  coarse: boolean;
  viewportWidth: number;
}

export function coachVariant(env: PointerEnv, mobileMaxWidthPx: number): CoachVariant {
  return env.coarse || env.viewportWidth <= mobileMaxWidthPx ? "mobile" : "desktop";
}

// ─── "Already seen" store ────────────────────────────────────────────────────

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reading `window.localStorage` itself can throw (blocked storage), hence a thunk. */
export type StorageProvider = () => KeyValueStorage | null;

export const SEEN_VALUE = "1";

export interface CoachStore {
  hasSeen(): boolean;
  /** True when the guide would auto-open (not seen, not opened this session). */
  wouldAutoOpen(): boolean;
  /** Like `wouldAutoOpen`, and consumes the session's single auto-open. */
  claimAutoOpen(): boolean;
  /** Remembers the guide; returns false if storage refused (memory still holds it). */
  markSeen(): boolean;
}

function readSeen(provider: StorageProvider, key: string): boolean {
  try {
    return provider()?.getItem(key) === SEEN_VALUE;
  } catch {
    return false;
  }
}

function writeSeen(provider: StorageProvider, key: string): boolean {
  try {
    const storage = provider();
    if (!storage) return false;
    storage.setItem(key, SEEN_VALUE);
    return true;
  } catch {
    return false;
  }
}

export function createCoachStore(provider: StorageProvider, key: string): CoachStore {
  const memory = { seen: false, autoOpened: false };
  const hasSeen = (): boolean => memory.seen || readSeen(provider, key);
  const wouldAutoOpen = (): boolean => !memory.autoOpened && !hasSeen();
  return {
    hasSeen,
    wouldAutoOpen,
    claimAutoOpen() {
      if (!wouldAutoOpen()) return false;
      memory.autoOpened = true;
      return true;
    },
    markSeen() {
      memory.seen = true;
      return writeSeen(provider, key);
    },
  };
}

// ─── Geometry (CSS px, snapped to the 2 px logical grid) ─────────────────────

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GRID = 2;
const snapDown = (n: number): number => Math.floor(n / GRID) * GRID;
const snapUp = (n: number): number => Math.ceil(n / GRID) * GRID;

/** Grows a box by `pad`, snaps it outwards to the grid and clamps it to the viewport. */
export function padBox(box: Box, pad: number, viewport: { width: number; height: number }): Box {
  const left = Math.max(0, snapDown(box.x - pad));
  const top = Math.max(0, snapDown(box.y - pad));
  const right = Math.min(snapUp(viewport.width), snapUp(box.x + box.width + pad));
  const bottom = Math.min(snapUp(viewport.height), snapUp(box.y + box.height + pad));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** A square of `size` at the centre of `container` (your node starts there). */
export function centreBox(container: Box, size: number): Box {
  return {
    x: container.x + (container.width - size) / 2,
    y: container.y + (container.height - size) / 2,
    width: size,
    height: size,
  };
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Full-viewport polygon with a rectangular hole (even-odd), for the dimmed layer. */
export function holeClipPath(hole: Box): string {
  const [l, t, r, b] = [hole.x, hole.y, hole.x + hole.width, hole.y + hole.height];
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`;
}
