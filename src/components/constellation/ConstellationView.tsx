"use client";

/**
 * ConstellationView — the composed experience, and Phase C's entry point.
 *
 * Owns the three pieces of state that tie the sub-components together:
 *   • the active track,
 *   • the selected node (drives both the happy-frame highlight and the sheet),
 *   • the resolved reduced-motion preference.
 *
 * Phase C only needs to map `GET /api/result-v2` onto `me` / `matches` and drop
 * this component on a page:
 *
 * ```tsx
 * <ConstellationView me={me} matches={matches} initialTrack="romance" />
 * ```
 *
 * The sub-components are also exported individually from `./index` in case a
 * route wants to own the toggle or the sheet itself.
 */

import { useCallback, useMemo, useState } from "react";

import { getTrackThreshold } from "@/lib/constellation-layout";
import type { MatchTrack } from "@/types/microtest-v2";

import { ConstellationCanvas } from "./ConstellationCanvas";
import { useReducedMotionPreference } from "./hooks";
import { NodeDetailSheet } from "./NodeDetailSheet";
import { matchesForTrack } from "./render-helpers";
import { TrackToggle } from "./TrackToggle";
import { CONSTELLATION_COPY, type ConstellationViewProps } from "./types";

export function ConstellationView({
  me,
  matches,
  initialTrack = "romance",
  ghostCount = 8,
  reducedMotion,
  className,
  style,
  title = CONSTELLATION_COPY.viewTitle,
  emptyMessage,
}: ConstellationViewProps) {
  const motionReduced = useReducedMotionPreference(reducedMotion);
  const [track, setTrack] = useState<MatchTrack>(initialTrack);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      romance: matchesForTrack(matches, "romance", getTrackThreshold("romance")).length,
      amistad: matchesForTrack(matches, "amistad", getTrackThreshold("amistad")).length,
    }),
    [matches],
  );

  // Only a match that is real under the ACTIVE track can open the sheet, so a
  // stale selection can never surface somebody the sky is not showing.
  const selected = useMemo(() => {
    if (selectedNodeId === null) return null;
    return matches.find((match) => match.id === selectedNodeId && match.track === track) ?? null;
  }, [matches, selectedNodeId, track]);

  const handleTrackChange = useCallback((next: MatchTrack): void => {
    setTrack(next);
    setSelectedNodeId(null);
  }, []);

  const handleSelectNode = useCallback((nodeId: string): void => {
    setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);

  const handleClose = useCallback((): void => {
    setSelectedNodeId(null);
  }, []);

  return (
    <section
      className={`constellation-view w-full ${className ?? ""}`.trim()}
      style={style}
      aria-labelledby="constellation-view-title"
    >
      <header className="mb-4">
        <h2
          id="constellation-view-title"
          className="font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-3xl"
        >
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/70">
          {CONSTELLATION_COPY.viewSubtitle}
        </p>
      </header>

      <TrackToggle
        track={track}
        onChange={handleTrackChange}
        counts={counts}
        reducedMotion={motionReduced}
        panelId="constellation-panel"
        className="mb-4"
      />

      <div
        id="constellation-panel"
        role="tabpanel"
        aria-labelledby={`constellation-tab-${track}`}
        className="outline-none"
      >
        <ConstellationCanvas
          me={me}
          matches={matches}
          track={track}
          ghostCount={ghostCount}
          reducedMotion={motionReduced}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          emptyMessage={emptyMessage}
        />
      </div>

      <NodeDetailSheet
        node={selected}
        self={me}
        track={track}
        reducedMotion={motionReduced}
        onClose={handleClose}
      />
    </section>
  );
}

export default ConstellationView;
