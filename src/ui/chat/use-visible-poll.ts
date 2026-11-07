"use client";

/**
 * Polling with backoff (docs/CHAT.md §12.7): starts at `minSeconds`, doubles
 * up to `maxSeconds` while `tick` reports no change, and resets on change, on
 * focus, when the tab becomes visible or when the network comes back. One
 * timer at a time; hidden tabs never poll. Chosen over Supabase Realtime
 * because chat tables are server-only (ADR-039).
 *
 * `startBackoffPoll` is separate from the hook so the timing and the wake-up
 * events can be tested without a DOM renderer.
 */
import { useEffect, useRef } from "react";

const MS_PER_SECOND = 1000;
const BACKOFF_FACTOR = 2;

export function startBackoffPoll(
  tick: () => Promise<boolean>,
  minSeconds: number,
  maxSeconds: number,
): () => void {
  let delay = minSeconds;
  let timer = 0;
  let stopped = false;
  let running = false;
  const schedule = () => {
    window.clearTimeout(timer);
    if (!stopped) timer = window.setTimeout(run, delay * MS_PER_SECOND);
  };
  const run = async () => {
    // Two wake-ups in a row (focus + visibilitychange) must not double-fetch.
    if (running) return;
    if (document.hidden) return schedule();
    running = true;
    const changed = await tick().catch(() => false);
    running = false;
    delay = changed ? minSeconds : Math.min(maxSeconds, delay * BACKOFF_FACTOR);
    schedule();
  };
  const wake = () => {
    if (document.hidden) return;
    delay = minSeconds;
    void run();
  };
  // A phone coming back to the app fires `focus` without `visibilitychange`,
  // and `visibilitychange` bubbles from the document to the window: one
  // listener per event, on the target that owns it.
  const sources: Array<[Document | Window, string]> = [
    [document, "visibilitychange"],
    [window, "focus"],
    [window, "online"],
  ];
  schedule();
  for (const [target, event] of sources) target.addEventListener(event, wake);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    for (const [target, event] of sources) target.removeEventListener(event, wake);
  };
}

/** Calls `tick` every `seconds` while the tab is visible. Hidden tabs never poll. */
export function useVisiblePoll(tick: () => void, seconds: number, active = true): void {
  useBackoffPoll(async () => {
    tick();
    return true;
  }, seconds, seconds, active);
}

export function useBackoffPoll(tick: () => Promise<boolean>, minSeconds: number, maxSeconds: number, active = true): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) return;
    return startBackoffPoll(() => latest.current(), minSeconds, maxSeconds);
  }, [minSeconds, maxSeconds, active]);
}