"use client";

import { useEffect, useState } from "react";

const TICK_MS = 1000;

/** Epoch ms `seconds` from now; call it from event handlers, not during render. */
export function deadlineIn(seconds: number | undefined): number | null {
  return seconds && seconds > 0 ? Date.now() + seconds * TICK_MS : null;
}

/** Whole seconds left until `until`, ticking calmly once a second. */
export function useSecondsUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= until) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, TICK_MS);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [until]);

  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / TICK_MS));
}
