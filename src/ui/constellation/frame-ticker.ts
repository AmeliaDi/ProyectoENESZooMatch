/**
 * Constellation render layer — shared idle-frame ticker.
 *
 * Every visible star blinks between `idle_1` and `idle_2`. Doing that with a
 * React state update per sprite would re-render the whole constellation twice a
 * second, so instead there is ONE module-level interval that notifies
 * subscribers, and each subscriber writes its own `<image x="…">` attribute
 * directly. Zero React re-renders, zero extra timers.
 *
 * The interval only exists while at least one sprite is subscribed, so a
 * reduced-motion constellation (which subscribes to nothing) never starts a
 * timer at all. Nothing runs at import time, which keeps this module safe to
 * evaluate during SSR.
 */

import { IDLE_FRAME_INTERVAL_MS } from "./render-helpers";

/** Called with the current idle column (0 or 1) on every tick. */
export type IdleFrameListener = (index: number) => void;

const listeners = new Set<IdleFrameListener>();

let timer: ReturnType<typeof setInterval> | null = null;
let index = 0;

function stop(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function start(): void {
  if (timer !== null) return;
  if (typeof window === "undefined") return;
  timer = setInterval(() => {
    index = index === 0 ? 1 : 0;
    for (const listener of listeners) listener(index);
  }, IDLE_FRAME_INTERVAL_MS);
}

/** Current idle column (0 or 1). Read at mount to avoid a visible first blink. */
export function getIdleFrameIndex(): number {
  return index;
}

/**
 * Subscribes to the shared blink. Returns the unsubscribe function; the timer
 * is torn down automatically when the last listener leaves.
 */
export function subscribeIdleFrames(listener: IdleFrameListener): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Number of live subscribers. Exposed for tests and debugging. */
export function idleListenerCount(): number {
  return listeners.size;
}

/** Stops the timer and drops every listener (test / HMR helper). */
export function resetIdleTicker(): void {
  stop();
  listeners.clear();
  index = 0;
}
