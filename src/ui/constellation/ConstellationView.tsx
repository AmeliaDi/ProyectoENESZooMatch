"use client";

/**
 * ConstellationView — the canvas plus its detail sheet, with the track either
 * owned here (dev panel) or controlled by the parent (result screen, which
 * shares the Romance/Amistad tabs with the list view).
 */

import { useCallback, useMemo, useState } from "react";

import { getTrackThreshold } from "@/domain/constellation";
import type { MatchTrack } from "@/types/microtest";
import { useChatMarks } from "@/ui/chat/use-chat-marks";
import { emitFeedback } from "@/ui/feedback/feedback";

import { ConstellationCanvas } from "./ConstellationCanvas";
import { useReducedMotionPreference } from "./hooks";
import { NodeDetailSheet } from "./NodeDetailSheet";
import { matchesForTrack } from "./render-helpers";
import { TrackToggle } from "./TrackToggle";
import type { ConstellationCanvasProps, ConstellationViewProps } from "./types";

export interface ControlledTrack {
  /** When set, the parent owns the track and renders its own tabs. */
  track?: MatchTrack;
}

/** Dev-only pass-through to the canvas (physics panel). */
export type CanvasExtras = Pick<
  ConstellationCanvasProps,
  "pairSimilarity" | "onMetrics" | "physics" | "maxMatches" | "controlRef" | "thresholdOverride"
>;

export function ConstellationView({
  me,
  matches,
  initialTrack = "romance",
  track: controlledTrack,
  ghostCount = 8,
  reducedMotion,
  className,
  style,
  emptyMessage,
  ...extras
}: ConstellationViewProps & ControlledTrack & CanvasExtras) {
  const motionReduced = useReducedMotionPreference(reducedMotion);
  const [ownTrack, setOwnTrack] = useState<MatchTrack>(initialTrack);
  const track = controlledTrack ?? ownTrack;
  const [selection, setSelection] = useState<{ id: string; track: MatchTrack } | null>(null);

  const counts = useMemo(
    () => ({
      romance: matchesForTrack(matches, "romance", getTrackThreshold("romance")).length,
      amistad: matchesForTrack(matches, "amistad", getTrackThreshold("amistad")).length,
    }),
    [matches],
  );

  // A selection made under another track is ignored, so a stale one can never
  // surface somebody the sky is not showing.
  const selectedId = selection?.track === track ? selection.id : null;
  const selected = useMemo(
    () => (selectedId ? (matches.find((m) => m.id === selectedId && m.track === track) ?? null) : null),
    [matches, selectedId, track],
  );

  const handleSelect = useCallback(
    (nodeId: string) => {
      // A still sky never chimes a union, so the touch itself answers (sound only).
      if (motionReduced) emitFeedback("tap");
      setSelection((current) => (current?.id === nodeId ? null : { id: nodeId, track }));
    },
    [track, motionReduced],
  );
  const handleClose = useCallback(() => setSelection(null), []);
  const chatMarks = useChatMarks(track);

  return (
    <section className={`zm-sky-view ${className ?? ""}`.trim()} style={style} aria-label="Tu constelación">
      {controlledTrack === undefined ? (
        <TrackToggle track={track} onChange={setOwnTrack} counts={counts} panelId="constellation-panel" />
      ) : null}
      <div
        id={`constellation-panel-${track}`}
        role="tabpanel"
        aria-labelledby={`constellation-tab-${track}`}
        data-coach="canvas"
        data-coach-self-id={me.id}
      >
        <ConstellationCanvas
          me={me}
          matches={matches}
          track={track}
          ghostCount={ghostCount}
          reducedMotion={motionReduced}
          selectedNodeId={selectedId}
          onSelectNode={handleSelect}
          chatMarks={chatMarks}
          {...(emptyMessage !== undefined ? { emptyMessage } : {})}
          {...extras}
        />
      </div>
      <NodeDetailSheet node={selected} self={me} track={track} reducedMotion={motionReduced} onClose={handleClose} />
    </section>
  );
}

export default ConstellationView;
