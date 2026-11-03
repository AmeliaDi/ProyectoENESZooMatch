"use client";

/**
 * Browser plumbing for the quick guide: where the highlighted element is and
 * which variant fits this device. The decisions themselves live in
 * `coachmarks.ts` (pure, tested in Node).
 */

import { useEffect, useState } from "react";

import { EXPERIENCE } from "@/config";

import { centreBox, coachVariant, padBox, sameBox, type Box, type CoachTarget, type CoachVariant } from "./coachmarks";

const CFG = EXPERIENCE.coachmarks;

function toBox(rect: DOMRect): Box | null {
  return rect.width > 0 && rect.height > 0 ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;
}

function rectOf(element: Element | null | undefined): Box | null {
  return element ? toBox(element.getBoundingClientRect()) : null;
}

function selfBox(canvas: Element | null): Box | null {
  const marked = rectOf(document.querySelector('[data-coach="self"]'));
  if (marked) return marked;
  const selfId = canvas?.getAttribute("data-coach-self-id");
  const node = selfId ? canvas?.querySelector(`[data-node-id="${CSS.escape(selfId)}"]`) : null;
  const canvasBox = rectOf(canvas);
  return rectOf(node) ?? (canvasBox ? centreBox(canvasBox, CFG.selfFallbackPx) : null);
}

/**
 * Finds the element a step explains. The result screen owns its own
 * Romance/Amistad tabs, so "tracks" falls back to the tablist that holds the
 * `constellation-tab-*` ids when no `data-coach="tracks"` anchor exists.
 */
export function locateCoachTarget(target: CoachTarget): Box | null {
  const canvas = document.querySelector('[data-coach="canvas"]');
  if (target === "canvas") return rectOf(canvas);
  if (target === "self") return selfBox(canvas);
  const anchor = document.querySelector('[data-coach="tracks"]');
  return rectOf(anchor) ?? rectOf(document.getElementById("constellation-tab-romance")?.closest('[role="tablist"]'));
}

function measure(target: CoachTarget): Box | null {
  const box = locateCoachTarget(target);
  return box ? padBox(box, CFG.highlightPadPx, { width: window.innerWidth, height: window.innerHeight }) : null;
}

/**
 * Viewport box of the current target, re-measured on scroll, resize and a
 * slow timer (your node drifts with the physics). Null while nothing is shown.
 */
export function useCoachTarget(target: CoachTarget | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!target) return;
    const update = (): void => {
      const next = measure(target);
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    const frame = window.requestAnimationFrame(update);
    const timer = window.setInterval(update, CFG.trackMs);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  return target ? box : null;
}

export function detectCoachVariant(): CoachVariant {
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coachVariant({ coarse, viewportWidth: window.innerWidth }, CFG.mobileMaxWidthPx);
}
