"use client";

/**
 * TrackToggle — the segmented Romance / Amistad switch.
 *
 * Deliberately reuses the existing `.track-tab` / `.track-tab--{track}` rules
 * from `globals.css` (the same ones `PublicResultView` uses) so the
 * constellation feels like part of the result experience and so the global
 * `prefers-reduced-motion` block already in the stylesheet handles the
 * transition for us — no extra animation code, no new CSS.
 *
 * Semantics follow the ARIA tabs pattern used elsewhere in the result experience: a `tablist` with
 * two `tab`s, roving `tabIndex`, arrow-key movement and `aria-controls` on the
 * region being swapped. Changing the track does NOT unmount the canvas; it only
 * re-targets the simulation, so the stars physically glide to their new rest
 * points instead of blinking out.
 */

import { useCallback, useRef, type KeyboardEvent } from "react";

import type { MatchTrack } from "@/types/microtest";

import { connectionsLabel } from "./render-helpers";
import { CONSTELLATION_COPY, type TrackToggleProps } from "./types";

const TRACKS: readonly MatchTrack[] = ["romance", "amistad"] as const;

const LABELS: Record<MatchTrack, { icon: string; text: string }> = {
  romance: { icon: "💫", text: "Romance" },
  amistad: { icon: "✨", text: "Amistad" },
};

export function TrackToggle({
  track,
  onChange,
  counts,
  reducedMotion = false,
  panelId = "constellation-panel",
  className,
}: TrackToggleProps) {
  const buttons = useRef<Record<MatchTrack, HTMLButtonElement | null>>({
    romance: null,
    amistad: null,
  });

  const focusTrack = useCallback((next: MatchTrack): void => {
    buttons.current[next]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>): void => {
      const key = event.key;
      if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
      event.preventDefault();
      const current = TRACKS.indexOf(track);
      let nextIndex: number;
      if (key === "Home") nextIndex = 0;
      else if (key === "End") nextIndex = TRACKS.length - 1;
      else if (key === "ArrowRight") nextIndex = (current + 1) % TRACKS.length;
      else nextIndex = (current - 1 + TRACKS.length) % TRACKS.length;
      const next = TRACKS[nextIndex];
      if (next !== track) onChange(next);
      focusTrack(next);
    },
    [track, onChange, focusTrack],
  );

  return (
    <div
      role="tablist"
      aria-label={CONSTELLATION_COPY.trackToggleLabel}
      aria-orientation="horizontal"
      className={`flex flex-wrap items-center gap-2 ${className ?? ""}`.trim()}
    >
      {TRACKS.map((option) => {
        const active = option === track;
        const label = LABELS[option];
        const count = counts?.[option];
        return (
          <button
            key={option}
            ref={(element) => {
              buttons.current[option] = element;
            }}
            type="button"
            role="tab"
            id={`constellation-tab-${option}`}
            aria-selected={active}
            aria-controls={panelId}
            data-active={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) onChange(option);
            }}
            onKeyDown={onKeyDown}
            className={`track-tab track-tab--${option} inline-flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
              reducedMotion ? "transition-none" : ""
            }`}
          >
            <span aria-hidden="true">{label.icon}</span>
            <span>{label.text}</span>
            {typeof count === "number" ? (
              <>
                <span
                  aria-hidden="true"
                  className="ml-0.5 rounded-full bg-ink/10 px-1.5 py-px font-mono text-[0.62rem] leading-tight tabular-nums"
                >
                  {count}
                </span>
                <span className="sr-only">, {connectionsLabel(count)}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default TrackToggle;
