"use client";

/**
 * TrackToggle — Romance / Amistad as the kit's pixel tabs. Changing the track
 * does not unmount the canvas; it only re-targets the simulation.
 */

import { Tabs } from "@/ui/kit/tabs";
import type { MatchTrack } from "@/types/microtest";

import { CONSTELLATION_COPY, type TrackToggleProps } from "./types";

export function TrackToggle({ track, onChange, counts, panelId = "constellation-panel" }: TrackToggleProps) {
  const suffix = (n: number | undefined) => (typeof n === "number" ? ` · ${n}` : "");
  // The kit derives `${idPrefix}-panel-${key}`; the canvas panel uses `panelId`.
  const prefix = panelId.replace(/-panel$/, "");
  return (
    <Tabs<MatchTrack>
      label={CONSTELLATION_COPY.trackToggleLabel}
      idPrefix={prefix}
      items={[
        { key: "romance", label: `Romance${suffix(counts?.romance)}`, icon: "romance", tone: "romance" },
        { key: "amistad", label: `Amistad${suffix(counts?.amistad)}`, icon: "amistad", tone: "amistad" },
      ]}
      value={track}
      onChange={onChange}
    />
  );
}

export default TrackToggle;
