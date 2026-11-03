"use client";

import { useEffect, useRef } from "react";

const MS_PER_SECOND = 1000;

/**
 * Calls `tick` every `seconds` while the tab is visible, and once right away
 * when it becomes visible again. Hidden tabs never poll.
 */
export function useVisiblePoll(tick: () => void, seconds: number, active = true): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (!document.hidden) latest.current();
    };
    const timer = window.setInterval(run, seconds * MS_PER_SECOND);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [seconds, active]);
}
