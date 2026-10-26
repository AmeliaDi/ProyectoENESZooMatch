"use client";

/**
 * ConstellationSection — the drop-in wrapper that feeds the approved Phase B
 * `ConstellationView` from the parsed `GET /api/result` payload.
 *
 * Responsibilities:
 *  - run the pure `adaptResult` mapper (memoised) to turn `PublicResult` into
 *    `{ me, matches }`;
 *  - own the loading / error / unresolvable-identity fallbacks with warm es-MX
 *    copy consistent with the rest of the result experience;
 *  - always pass the EXACT, test-protected `NO_MATCH_MESSAGE` literal as the
 *    empty message, so an empty sky (both tracks without a match above their
 *    frozen threshold) still shows the lone self star plus that reassurance.
 *
 * It never fetches and never touches Supabase: the parent already owns the
 * network request and hands down the parsed result.
 */

import { useMemo } from "react";

import {
  NO_MATCH_MESSAGE,
  type PublicResult,
} from "@/components/public-experience-utils";
import type { MatchTrack } from "@/types/microtest";

import { adaptResult } from "./adapt-result";
import { ConstellationView } from "./ConstellationView";
import { CONSTELLATION_COPY } from "./types";

export interface ConstellationSectionProps {
  /** The parsed result payload, or `null` while it is still being fetched. */
  result: PublicResult | null;
  /** Shows the "acomodando las estrellas…" placeholder. */
  loading?: boolean;
  /** Shows the gentle error fallback. */
  error?: boolean;
  /** Track the sky opens on. Defaults to `"romance"`. */
  initialTrack?: MatchTrack;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/** Reserved-height box shared by the placeholder and error states. */
const FALLBACK_STYLE = { minHeight: "22rem" } as const;

export function ConstellationSection({
  result,
  loading = false,
  error = false,
  initialTrack = "romance",
  className,
}: ConstellationSectionProps) {
  const adapted = useMemo(() => (result ? adaptResult(result) : null), [result]);

  if (loading) {
    return (
      <div
        className={`cosmic-sky grid place-items-center rounded-3xl border border-white/10 p-8 text-center ${className ?? ""}`.trim()}
        style={FALLBACK_STYLE}
        role="status"
        aria-live="polite"
      >
        <p className="font-display text-lg italic leading-relaxed text-paper/70">
          {CONSTELLATION_COPY.loading}
        </p>
      </div>
    );
  }

  if (error || !result || !adapted) {
    return (
      <div
        className={`cosmic-sky grid place-items-center rounded-3xl border border-white/10 p-8 text-center ${className ?? ""}`.trim()}
        style={FALLBACK_STYLE}
        role="status"
        aria-live="polite"
      >
        <p className="max-w-md font-display text-lg italic leading-relaxed text-paper/75">
          {
            "Por ahora no podemos dibujar tu constelación, pero tu resultado sigue aquí a salvo. Inténtalo de nuevo en un ratito <3"
          }
        </p>
      </div>
    );
  }

  return (
    <ConstellationView
      me={adapted.me}
      matches={adapted.matches}
      initialTrack={initialTrack}
      emptyMessage={NO_MATCH_MESSAGE}
      className={className}
      // The canvas already reserves a definite height (min(72vh,44rem), floor
      // 22rem); this floor on the outer section avoids layout shift while it boots.
      style={{ minHeight: "22rem" }}
    />
  );
}

export default ConstellationSection;
