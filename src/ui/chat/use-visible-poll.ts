"use client";

import { useEffect, useRef } from "react";

const MS_PER_SECOND = 1000;
const BACKOFF_FACTOR = 2;

/**
 * Calls `tick` every `seconds` while the tab is visible, and once right away
 * when it becomes visible again. Hidden tabs never poll.
 */
export function useVisiblePoll(tick: () => void, seconds: number, active = true): void {
  useBackoffPoll(async () => {
    tick();
    return true;
  }, seconds, seconds, active);
}

/**
 * Polling with backoff (docs/CHAT.md §12.7): starts at `minSeconds`, doubles
 * up to `maxSeconds` while `tick` reports no change, and resets on change,
 * on focus or when the tab becomes visible. One timer at a time; hidden tabs
 * never poll. Chosen over Supabase Realtime because chat tables are
 * server-only (no client RLS policies to subscribe through).
 */
export function useBackoffPoll(tick: () => Promise<boolean>, minSeconds: number, maxSeconds: number, active = true): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) return;
    let delay = minSeconds;
    let timer = 0;
    let stopped = false;
    const schedule = () => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(run, delay * MS_PER_SECOND);
    };
    const run = async () => {
      if (document.hidden) return schedule();
      const changed = await latest.current().catch(() => false);
      delay = changed ? minSeconds : Math.min(maxSeconds, delay * BACKOFF_FACTOR);
      schedule();
    };
    const wake = () => {
      if (document.hidden) return;
      delay = minSeconds;
      void run();
    };
    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [minSeconds, maxSeconds, active]);
}
