"use client";

/**
 * Wires the pure state machine (`coachmarks.ts`) to the browser: one
 * auto-open per session after a short delay, Escape to close, focus to the
 * card's main button on every step and back to the `?` button on close.
 */

import { useCallback, useEffect, useId, useReducer, useRef, type Dispatch } from "react";

import { EXPERIENCE } from "@/config";

import { detectCoachVariant } from "./coach-hooks";
import {
  COACH_INITIAL,
  coachReducer,
  createCoachStore,
  isLastStep,
  persistsOnClose,
  type CoachAction,
  type CoachCloseReason,
  type CoachState,
  type CoachStore,
} from "./coachmarks";

const CFG = EXPERIENCE.coachmarks;

/** One store per page load: its memory is what keeps a failed write from re-opening the guide. */
let sharedStore: CoachStore | null = null;
function coachStore(): CoachStore {
  sharedStore ??= createCoachStore(() => window.localStorage, CFG.storageKey);
  return sharedStore;
}

function useAutoOpen(enabled: boolean, dispatch: Dispatch<CoachAction>): void {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => {
      if (coachStore().claimAutoOpen()) dispatch({ type: "open", variant: detectCoachVariant() });
    }, CFG.openDelayMs);
    return () => window.clearTimeout(id);
  }, [enabled, dispatch]);
}

/** The kit's Button takes no ref, so focus targets are found by id. */
function useFocusFlow(state: CoachState, primaryId: string, helpId: string): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (state.open) document.getElementById(primaryId)?.focus();
    else if (wasOpen.current) (document.getElementById(helpId) ?? document.querySelector<HTMLElement>('[data-coach="canvas"] svg'))?.focus();
    wasOpen.current = state.open;
  }, [state.open, state.step, primaryId, helpId]);
}

function useEscape(open: boolean, close: (reason: CoachCloseReason) => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      // An open detail sheet owns Escape first.
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      close("skip");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);
}

export interface CoachController {
  state: CoachState;
  open: () => void;
  next: () => void;
  back: () => void;
  close: (reason: CoachCloseReason) => void;
  helpId: string;
  primaryId: string;
}

export function useCoachmarks(enabled: boolean): CoachController {
  const [state, dispatch] = useReducer(coachReducer, COACH_INITIAL);
  const helpId = useId();
  const primaryId = useId();

  const close = useCallback(
    (reason: CoachCloseReason) => {
      if (persistsOnClose(reason, state.variant)) coachStore().markSeen();
      dispatch({ type: "close", reason });
    },
    [state.variant],
  );
  const open = useCallback(() => dispatch({ type: "open", variant: detectCoachVariant() }), []);
  const next = useCallback(() => (isLastStep(state) ? close("finish") : dispatch({ type: "next" })), [state, close]);
  const back = useCallback(() => dispatch({ type: "back" }), []);

  useAutoOpen(enabled, dispatch);
  useFocusFlow(state, primaryId, helpId);
  useEscape(state.open, close);

  return { state, open, next, back, close, helpId, primaryId };
}
