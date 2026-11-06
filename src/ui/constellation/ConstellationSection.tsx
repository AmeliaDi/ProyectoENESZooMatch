"use client";

/**
 * ConstellationSection — feeds `ConstellationView` from the parsed
 * `GET /api/result` payload. It never fetches; the parent owns the request.
 * An unresolvable identity degrades to a calm error state, never a blank box.
 */

import { useMemo } from "react";

import type { ResultDto } from "@/contracts/result";
import { CoachMarks } from "@/ui/coach/coach-guide";
import { ErrorState, LoadingState } from "@/ui/kit/states";
import { NO_MATCH_MESSAGE } from "@/ui/result/parse-result";
import type { MatchTrack } from "@/types/microtest";

import { adaptResult } from "./adapt-result";
import { ConstellationView } from "./ConstellationView";
import { CONSTELLATION_COPY } from "./types";

export interface ConstellationSectionProps {
  result: ResultDto | null;
  loading?: boolean;
  error?: boolean;
  /** Controlled track (the result screen owns the tabs). */
  track?: MatchTrack;
  initialTrack?: MatchTrack;
  emptyMessage?: string;
  className?: string;
  /** Quick guide on the first visit (the result screen); off for embeds. */
  coachmarks?: boolean;
}

export function ConstellationSection({
  result,
  loading = false,
  error = false,
  track,
  initialTrack = "romance",
  emptyMessage = NO_MATCH_MESSAGE,
  className,
  coachmarks = true,
}: ConstellationSectionProps) {
  const adapted = useMemo(() => (result ? adaptResult(result) : null), [result]);

  if (loading) return <LoadingState title={CONSTELLATION_COPY.loading} />;
  if (error || !result || !adapted) {
    return (
      <ErrorState
        title="No pudimos dibujar tu cielo"
        body="Tu resultado sigue a salvo. Prueba la vista de lista o intenta en un ratito."
      />
    );
  }

  return (
    <div className="zm-coach-host">
      <ConstellationView
        me={adapted.me}
        matches={adapted.matches}
        initialTrack={initialTrack}
        {...(track !== undefined ? { track } : {})}
        emptyMessage={emptyMessage}
        {...(className !== undefined ? { className } : {})}
      />
      {coachmarks ? <CoachMarks autoOpen /> : null}
    </div>
  );
}

export default ConstellationSection;
