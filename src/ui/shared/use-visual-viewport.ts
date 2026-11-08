"use client";

/**
 * Hook that tracks the visual viewport size, which changes when the mobile
 * keyboard opens/closes. Used to keep the chat input visible above the keyboard
 * without layout jumps.
 *
 * Falls back to window.innerHeight on servers or browsers without visualViewport.
 */

import { useCallback, useEffect, useState } from "react";

export interface VisualViewportSize {
  width: number;
  height: number;
  /** Distance from the bottom of the layout viewport to the visual viewport (keyboard height). */
  offsetBottom: number;
}

function getSize(): VisualViewportSize {
  if (typeof window === "undefined" || !window.visualViewport) {
    return {
      width: typeof window !== "undefined" ? window.innerWidth : 0,
      height: typeof window !== "undefined" ? window.innerHeight : 0,
      offsetBottom: 0,
    };
  }
  const vv = window.visualViewport;
  return {
    width: vv.width,
    height: vv.height,
    offsetBottom: window.innerHeight - vv.height - (vv.offsetTop ?? 0),
  };
}

export function useVisualViewport(): VisualViewportSize {
  const [size, setSize] = useState<VisualViewportSize>(getSize);

  const handleResize = useCallback(() => {
    setSize(getSize());
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);

    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, [handleResize]);

  return size;
}
